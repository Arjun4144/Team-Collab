// client/src/hooks/useWebRTC.js
// Manages WebRTC peer connections, local stream, and signaling via socket

import { useEffect, useRef, useState, useCallback } from "react";
import useStore from "../store/useStore";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function useWebRTC({ socket, channelId, userId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { userId: MediaStream }
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState("connecting"); // connecting | connected | disconnected

  const peerConnections = useRef({}); // { userId: RTCPeerConnection }
  const peerSocketIds = useRef({}); // { userId: socketId } - map for routing messages
  const iceCandidateQueue = useRef({}); // { userId: [candidates] }
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const timerRef = useRef(null);

  // ── Get user media ──────────────────────────────────────────────────────────
  const startLocalStream = useCallback(async ({ audio = true, video = false } = {}) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setConnectionStatus("connected");
      return stream;
    } catch (err) {
      console.error("[WebRTC] getUserMedia error:", err);
      // Try audio only fallback
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioOnly;
        setLocalStream(audioOnly);
        setIsVideoOff(true);
        setConnectionStatus("connected");
        return audioOnly;
      } catch (audioErr) {
        console.error("[WebRTC] Audio fallback failed:", audioErr);
        setConnectionStatus("disconnected");
        useStore.getState().showToast("Microphone access denied. Cannot join call.");
        return null;
      }
    }
  }, []);

  // ── Create RTCPeerConnection for a remote user ──────────────────────────────
  const createPeerConnection = useCallback((remoteUserId, remoteSocketId = null) => {
    if (peerConnections.current[remoteUserId]) {
      return peerConnections.current[remoteUserId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[remoteUserId] = pc;
    if (remoteSocketId) {
      peerSocketIds.current[remoteUserId] = remoteSocketId;
    }

    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const targetSocketId = peerSocketIds.current[remoteUserId];

        if (targetSocketId) {
          socket.emit("call:offer", {
            toSocketId: targetSocketId,
            offer,
            channelId,
            isRenegotiation: true,
          });
        }
      } catch (err) {
        console.error("[WebRTC] Negotiation error:", err);
      }
    };

    // Add existing audio/video tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ✅ FIX: Always pre-reserve a video transceiver slot so replaceTrack works
    // without triggering renegotiation when the user later turns on their camera.
    const hasVideoTrack = localStreamRef.current?.getVideoTracks().length > 0;
    if (!hasVideoTrack) {
      pc.addTransceiver("video", { direction: "sendrecv" });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => ({ ...prev, [remoteUserId]: remoteStream }));
    };

    // Send ICE candidates via socket
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        const targetSocketId = peerSocketIds.current[remoteUserId];
        if (targetSocketId) {
          socket.emit("call:ice-candidate", {
            toSocketId: targetSocketId,
            candidate: event.candidate,
            channelId,
          });
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
    };

    return pc;
  }, [socket, channelId]);

  // ── Remove a peer connection ────────────────────────────────────────────────
  const removePeerConnection = useCallback((remoteUserId) => {
    const pc = peerConnections.current[remoteUserId];
    if (pc) {
      pc.close();
      delete peerConnections.current[remoteUserId];
      delete peerSocketIds.current[remoteUserId];
    }
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[remoteUserId];
      return next;
    });
    setParticipants((prev) => prev.filter((p) => p.userId !== remoteUserId));
  }, []);

  // ── Join a channel call ─────────────────────────────────────────────────────
  const joinCall = useCallback(async () => {
    const stream = await startLocalStream();
    if (!stream || !socket) return;

    // Start call timer
    timerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);

    // Emit join AFTER stream is ready
    socket.emit("call:join", { channelId, userId, userName, videoOff: isVideoOff, muted: isMuted });
  }, [socket, channelId, userId, userName, startLocalStream, isVideoOff, isMuted]);

  // ── Leave a channel call ────────────────────────────────────────────────────
  const leaveCall = useCallback(() => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    // Close all peer connections
    Object.values(peerConnections.current).forEach((pc) => pc.close());
    peerConnections.current = {};
    peerSocketIds.current = {};

    clearInterval(timerRef.current);
    setLocalStream(null);
    setRemoteStreams({});
    setParticipants([]);
    setCallDuration(0);
    setConnectionStatus("disconnected");

    if (socket) socket.emit("call:leave", { channelId, userId });
  }, [socket, channelId, userId]);

  // ── Toggle microphone ───────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const nowMuted = !audioTrack.enabled;
      setIsMuted(nowMuted);
      if (socket) socket.emit("call:mute-toggle", { channelId, userId, muted: nowMuted });
    }
  }, [socket, channelId, userId]);

  // ── Toggle camera ───────────────────────────────────────────────────────────
  const toggleVideo = useCallback(async () => {
    if (isVideoOff) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = stream.getVideoTracks()[0];

        // Add to local stream ref so future peer connections include it
        localStreamRef.current.addTrack(newVideoTrack);

        // ✅ FIX: Use replaceTrack via transceiver (no renegotiation needed).
        // The video transceiver slot was pre-reserved in createPeerConnection,
        // so we can swap in the real track without triggering onnegotiationneeded.
        Object.values(peerConnections.current).forEach((pc) => {
          const transceiver = pc.getTransceivers().find(
            (t) => t.receiver.track.kind === "video"
          );
          if (transceiver) {
            transceiver.sender.replaceTrack(newVideoTrack).catch((err) => {
              console.error("[WebRTC] Error replacing track for video on:", err);
            });
          }
        });

        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setIsVideoOff(false);

        // Notify other participants
        if (socket) socket.emit("call:video-toggle", { channelId, userId, videoOff: false });
      } catch (err) {
        console.error("Camera error:", err);
        useStore.getState().showToast("Camera access denied or unavailable.");
      }
    } else {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];

      if (videoTrack) {
        videoTrack.stop();

        // ✅ FIX: Nullify the sender track via transceiver rather than removing it.
        // This keeps the SDP slot alive so video can be re-enabled later without
        // a full renegotiation round-trip.
        Object.values(peerConnections.current).forEach((pc) => {
          const transceiver = pc.getTransceivers().find(
            (t) => t.receiver.track.kind === "video"
          );
          if (transceiver) {
            transceiver.sender.replaceTrack(null).catch((err) => {
              console.error("[WebRTC] Error nullifying video track:", err);
            });
          }
        });

        localStreamRef.current.removeTrack(videoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      setIsVideoOff(true);

      // Notify other participants
      if (socket) socket.emit("call:video-toggle", { channelId, userId, videoOff: true });
    }
  }, [isVideoOff, socket, channelId, userId]);

  // ── Toggle screen share ─────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }

      // Restore camera video track in all peer connections
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
      Object.values(peerConnections.current).forEach((pc) => {
        const transceiver = pc.getTransceivers().find(
          (t) => t.receiver?.track?.kind === "video"
        );
        if (transceiver && transceiver.sender) {
          transceiver.sender.replaceTrack(cameraTrack).catch((err) => {
            console.error("[WebRTC] Error restoring camera track:", err);
          });
        }
      });

      // Restore local UI stream to show camera
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        const restoredStream = new MediaStream();
        if (videoTrack) restoredStream.addTrack(videoTrack);
        if (audioTrack) restoredStream.addTrack(audioTrack);
        setLocalStream(restoredStream);
      }

      setIsScreenSharing(false);
      if (socket) socket.emit("call:screen-share", { channelId, userId, sharing: false });
    } else {
      // Screen sharing is generally not supported on most mobile browsers.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        useStore.getState().showToast(
          isMobile
            ? "Screen sharing is not supported on mobile browsers. Please use a desktop."
            : "Screen sharing is not supported in this browser (requires HTTPS)."
        );
        return;
      }

      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in all peer connections
        Object.values(peerConnections.current).forEach((pc) => {
          const transceiver = pc.getTransceivers().find(
            (t) => t.receiver?.track?.kind === "video"
          );
          if (transceiver && transceiver.sender) {
            transceiver.sender.replaceTrack(screenTrack).catch((err) => {
              console.error("[WebRTC] Error replacing track for screen share:", err);
            });
          }
        });

        // Update local UI stream to show screen share
        const newStream = new MediaStream([screenTrack]);
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) newStream.addTrack(audioTrack);
        setLocalStream(newStream);

        screenTrack.onended = () => {
          if (isScreenSharing) toggleScreenShare();
        };

        setIsScreenSharing(true);
        if (socket) socket.emit("call:screen-share", { channelId, userId, sharing: true });
      } catch (err) {
        console.error("[WebRTC] Screen share error:", err);
        if (err.name === "NotAllowedError") {
          useStore.getState().showToast("Screen share permission denied.");
        } else if (isMobile) {
          useStore.getState().showToast("Screen sharing is restricted by your mobile browser.");
        } else {
          useStore.getState().showToast("Failed to start screen share. Please try again.");
        }
      }
    }
  }, [isScreenSharing, socket, channelId, userId]);

  // ── Toggle deafen ───────────────────────────────────────────────────────────
  const toggleDeafen = useCallback(() => {
    setIsDeafened((d) => {
      const next = !d;
      Object.values(remoteStreams).forEach((stream) => {
        if (stream) {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = !next;
          });
        }
      });
      return next;
    });
  }, [remoteStreams]);

  // ── Toggle raise hand ───────────────────────────────────────────────────────
  const toggleHand = useCallback(() => {
    setIsHandRaised((h) => {
      const next = !h;
      if (socket) socket.emit("call:hand-raise", { channelId, userId, raised: next });
      return next;
    });
  }, [socket, channelId, userId]);

  // ── Socket signaling listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Receive list of existing members already in the call
    const onExistingMembers = async ({ members }) => {
      console.log("[WebRTC] Existing members:", members);

      for (const member of members) {
        if (member.userId === userId) continue;

        // Add participant
        setParticipants((prev) => {
          if (prev.find((p) => p.userId === member.userId)) return prev;
          return [
            ...prev,
            {
              userId: member.userId,
              userName: member.userName,
              muted: member.muted,
              videoOff: member.videoOff,
              hand: false,
              userObject: member.userObject,
            },
          ];
        });

        const pc = createPeerConnection(member.userId, member.socketId);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("call:offer", {
            toSocketId: member.socketId,
            offer,
            channelId,
          });

          console.log("[WebRTC] Sent offer to", member.userId);
        } catch (err) {
          console.error("[WebRTC] Error creating offer:", err);
        }
      }
    };

    // New user joined → wait for their offer
    const onUserJoined = async ({
      socketId: remoteSocketId,
      userId: remoteId,
      userName: remoteName,
      userObject,
      videoOff,
      muted,
    }) => {
      console.log("[WebRTC] User joined:", remoteId, remoteName, "socketId:", remoteSocketId);
      if (remoteId === userId) return; // Skip self

      setParticipants((prev) => {
        if (prev.find((p) => p.userId === remoteId)) return prev;
        return [
          ...prev,
          {
            userId: remoteId,
            userName: remoteName,
            muted: muted || false,
            videoOff: videoOff || false,
            hand: false,
            userObject,
          },
        ];
      });

      // Do NOT send an offer to avoid glare. Create the connection and wait for their offer.
      createPeerConnection(remoteId, remoteSocketId);
    };

    // Receive offer → send answer
    const onOffer = async ({ fromSocketId, fromUserId, offer, isRenegotiation }) => {
      const remoteId = fromUserId || fromSocketId;

      const pc = createPeerConnection(remoteId, fromSocketId);

      try {
        // ✅ Rollback only if we're in the middle of our own offer exchange
        if (pc.signalingState !== "stable") {
          console.log("[WebRTC] Rolling back before applying new offer");
          await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("call:answer", {
          toSocketId: fromSocketId,
          answer,
          channelId,
        });

        // Flush any queued ICE candidates
        if (iceCandidateQueue.current[remoteId]) {
          for (const cand of iceCandidateQueue.current[remoteId]) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.error("[WebRTC] Queued ICE error after offer:", e);
            }
          }
          iceCandidateQueue.current[remoteId] = [];
        }
      } catch (err) {
        console.error("[WebRTC] Offer handling error:", err);
      }
    };

    // Receive answer
    const onAnswer = async ({ fromSocketId, fromUserId, fromUserName, answer, userObject }) => {
      console.log("[WebRTC] Received answer from", fromUserId);
      const remoteId = fromUserId || fromSocketId;
      const pc = peerConnections.current[remoteId];

      // Update participant with user object if available
      if (userObject) {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === remoteId ? { ...p, userObject } : p))
        );
      }

      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log("[WebRTC] Set remote description from answer (userId:", remoteId, ")");

          // Flush ICE queue
          if (iceCandidateQueue.current[remoteId]) {
            for (const cand of iceCandidateQueue.current[remoteId]) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.error("[WebRTC] Queued ICE error:", e);
              }
            }
            iceCandidateQueue.current[remoteId] = [];
          }
        } catch (err) {
          console.error("[WebRTC] Error setting remote description:", err);
        }
      } else {
        console.warn("[WebRTC] Received answer but no peer connection for userId:", remoteId);
      }
    };

    // Receive ICE candidate
    const onIceCandidate = async ({ fromSocketId, fromUserId, candidate }) => {
      const remoteId = fromUserId || fromSocketId;
      const pc = peerConnections.current[remoteId];
      if (pc) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("[WebRTC] ICE candidate error for", remoteId, ":", e);
          }
        } else {
          // Queue candidate until remote description is set
          if (!iceCandidateQueue.current[remoteId]) iceCandidateQueue.current[remoteId] = [];
          iceCandidateQueue.current[remoteId].push(candidate);
        }
      } else {
        console.warn("[WebRTC] Received ICE candidate but no peer connection for userId:", remoteId);
      }
    };

    // User left
    const onUserLeft = ({ socketId, userId: remoteId }) => {
      console.log("[WebRTC] User left:", remoteId);
      removePeerConnection(remoteId);
    };

    // Mute/video status update from others
    const onParticipantUpdate = ({ socketId, userId: remoteId, muted, videoOff, hand, screenSharing }) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === remoteId
            ? {
                ...p,
                ...(muted !== undefined && { muted }),
                ...(videoOff !== undefined && { videoOff }),
                ...(hand !== undefined && { hand }),
                ...(screenSharing !== undefined && { screenSharing }),
              }
            : p
        )
      );
    };

    socket.on("call:existing-members", onExistingMembers);
    socket.on("call:user-joined", onUserJoined);
    socket.on("call:offer", onOffer);
    socket.on("call:answer", onAnswer);
    socket.on("call:ice-candidate", onIceCandidate);
    socket.on("call:user-left", onUserLeft);
    socket.on("call:participant-update", onParticipantUpdate);

    return () => {
      socket.off("call:existing-members", onExistingMembers);
      socket.off("call:user-joined", onUserJoined);
      socket.off("call:offer", onOffer);
      socket.off("call:answer", onAnswer);
      socket.off("call:ice-candidate", onIceCandidate);
      socket.off("call:user-left", onUserLeft);
      socket.off("call:participant-update", onParticipantUpdate);
    };
  }, [socket, createPeerConnection, removePeerConnection, channelId, userId]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, [leaveCall]);

  return {
    // Streams
    localStream,
    remoteStreams,
    participants,
    // State
    isMuted,
    isVideoOff,
    isScreenSharing,
    isDeafened,
    isHandRaised,
    callDuration,
    connectionStatus,
    // Actions
    joinCall,
    leaveCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    toggleDeafen,
    toggleHand,
  };
}