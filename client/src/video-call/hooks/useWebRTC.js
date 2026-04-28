import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../utils/socket';

const peerConfigConnection = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
    ]
};

export default function useWebRTC(meetingId, inCall) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [remoteStreamVersion, setRemoteStreamVersion] = useState(1);
  const peerConnections = useRef({});
  const makingOffer = useRef({});
  const localStreamRef = useRef(new MediaStream());
  const screenTrackRef = useRef(null);
  const cameraTrackRef = useRef(null);

  // Broadcaster
  const broadcastMediaState = useCallback((camera, mic, screen) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('call:media-state', {
      meetingId,
      isCameraOn: camera,
      isMicOn: mic,
      isScreenSharing: screen,
    });
  }, [meetingId]);

  // Peer Connection Factory
  const createPeerConnection = useCallback((remoteSocketId, remoteUserId, remoteUserName) => {
    if (peerConnections.current[remoteSocketId]) return peerConnections.current[remoteSocketId];

    const socket = getSocket();
    const pc = new RTCPeerConnection(peerConfigConnection);
    peerConnections.current[remoteSocketId] = pc;

    // Add local tracks to the new peer connection
    localStreamRef.current.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current);
    });

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice-candidate', {
          meetingId,
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Handle Negotiation
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer.current[remoteSocketId] = true;
        await pc.setLocalDescription();
        socket.emit('webrtc:offer', {
          meetingId,
          targetSocketId: remoteSocketId,
          offer: pc.localDescription,
        });
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        makingOffer.current[remoteSocketId] = false;
      }
    };

    // Handle Incoming Tracks
    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const existingTracks = prev[remoteSocketId]?.stream?.getTracks() || [];
        const newTracks = existingTracks.includes(event.track) 
          ? existingTracks 
          : [...existingTracks, event.track];
        
        const newStream = new MediaStream(newTracks);
        
        return {
          ...prev,
          [remoteSocketId]: {
            ...prev[remoteSocketId],
            stream: newStream,
            userId: remoteUserId,
            userName: remoteUserName,
          }
        };
      });
      setRemoteStreamVersion(v => v + 1);
    };

    return pc;
  }, [meetingId]);

  // Track Synchronization
  const syncTracksToPeers = useCallback(() => {
    const currentTracks = localStreamRef.current.getTracks();

    Object.values(peerConnections.current).forEach(pc => {
      const senders = pc.getSenders();
      
      // Remove senders whose tracks are no longer in localStreamRef
      senders.forEach(sender => {
        if (sender.track && !currentTracks.includes(sender.track)) {
          try { pc.removeTrack(sender); } catch(e) {}
        }
      });

      // Add tracks that don't have a sender yet
      currentTracks.forEach(track => {
        const hasSender = pc.getSenders().some(s => s.track === track);
        if (!hasSender) {
          try { pc.addTrack(track, localStreamRef.current); } catch(e) {}
        }
      });
    });
    setLocalStream(new MediaStream(currentTracks));
  }, []);

  // Controls
  const toggleCamera = useCallback(async () => {
    if (!isCameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = stream.getVideoTracks()[0];
        
        if (cameraTrackRef.current) {
          localStreamRef.current.removeTrack(cameraTrackRef.current);
          cameraTrackRef.current.stop();
        }
        
        cameraTrackRef.current = videoTrack;
        localStreamRef.current.addTrack(videoTrack);
        syncTracksToPeers();
        setIsCameraOn(true);
        broadcastMediaState(true, isMicOn, isScreenSharing);
      } catch (err) {
        console.error("Camera error:", err);
      }
    } else {
      if (cameraTrackRef.current) {
        cameraTrackRef.current.enabled = false;
        cameraTrackRef.current.stop();
        localStreamRef.current.removeTrack(cameraTrackRef.current);
        cameraTrackRef.current = null;
      }
      setIsCameraOn(false);
      broadcastMediaState(false, isMicOn, isScreenSharing);
      syncTracksToPeers();
    }
  }, [isCameraOn, isMicOn, isScreenSharing, broadcastMediaState, syncTracksToPeers]);

  const toggleMic = useCallback(async () => {
    if (!isMicOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = stream.getAudioTracks()[0];
        
        // Remove previous mic track if any
        localStreamRef.current.getAudioTracks().forEach(t => {
            localStreamRef.current.removeTrack(t);
            t.stop();
        });

        localStreamRef.current.addTrack(audioTrack);
        syncTracksToPeers();
        setIsMicOn(true);
        broadcastMediaState(isCameraOn, true, isScreenSharing);
      } catch (err) {
        console.error("Mic error:", err);
      }
    } else {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = false;
        t.stop();
        localStreamRef.current.removeTrack(t);
      });
      setIsMicOn(false);
      broadcastMediaState(isCameraOn, false, isScreenSharing);
      syncTracksToPeers();
    }
  }, [isMicOn, isCameraOn, isScreenSharing, broadcastMediaState, syncTracksToPeers]);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          localStreamRef.current.removeTrack(screenTrack);
          syncTracksToPeers();
          broadcastMediaState(isCameraOn, isMicOn, false);
        };

        screenTrackRef.current = screenTrack;
        localStreamRef.current.addTrack(screenTrack);
        syncTracksToPeers();
        setIsScreenSharing(true);
        broadcastMediaState(isCameraOn, isMicOn, true);
      } catch (err) {
        console.error("Screen share error:", err);
      }
    } else {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        localStreamRef.current.removeTrack(screenTrackRef.current);
        screenTrackRef.current = null;
      }
      setIsScreenSharing(false);
      syncTracksToPeers();
      broadcastMediaState(isCameraOn, isMicOn, false);
    }
  }, [isScreenSharing, isCameraOn, isMicOn, broadcastMediaState, syncTracksToPeers]);

  // Socket Events
  useEffect(() => {
    if (!inCall || !meetingId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.on('call:user-joined', async ({ socketId, userId, userName }) => {
      const pc = createPeerConnection(socketId, userId, userName);
      // I was already here, so I send the initial offer
      setTimeout(async () => {
        try {
          makingOffer.current[socketId] = true;
          await pc.setLocalDescription();
          socket.emit('webrtc:offer', { meetingId, targetSocketId: socketId, offer: pc.localDescription });
        } catch (e) { } finally { makingOffer.current[socketId] = false; }
      }, 500);
    });

    socket.on('call:participants', ({ participants }) => {
      // I just joined, I'll just create PCs and wait for offers
      participants.forEach(p => {
        if (p.socketId !== socket.id && !peerConnections.current[p.socketId]) {
          createPeerConnection(p.socketId, p.userId, p.userName);
        }
      });
    });

    socket.on('webrtc:offer', async ({ fromSocketId, fromUserId, fromUserName, offer }) => {
      const pc = createPeerConnection(fromSocketId, fromUserId, fromUserName);
      const polite = socket.id < fromSocketId;
      const offerCollision = makingOffer.current[fromSocketId] || pc.signalingState !== 'stable';
      
      if (offerCollision && !polite) {
        return; // Ignore offer
      }
      
      try {
        if (offerCollision) {
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await pc.setLocalDescription();
        socket.emit('webrtc:answer', { meetingId, targetSocketId: fromSocketId, answer: pc.localDescription });
      } catch (e) { console.error("Offer error", e); }
    });

    socket.on('webrtc:answer', async ({ fromSocketId, answer }) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) { console.error("Answer error", e); }
      }
    });

    socket.on('webrtc:ice-candidate', async ({ fromSocketId, candidate }) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) { }
      }
    });

    socket.on('call:user-left', ({ socketId }) => {
      if (peerConnections.current[socketId]) {
        peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
      }
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    return () => {
      socket.off('call:user-joined');
      socket.off('call:participants');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      socket.off('call:user-left');
    };
  }, [inCall, meetingId, createPeerConnection]);

  const cleanup = useCallback(() => {
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    localStreamRef.current.getTracks().forEach(t => t.stop());
    localStreamRef.current = new MediaStream();
    setLocalStream(null);
    setRemoteStreams({});
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
  }, []);

  return {
    localStream,
    remoteStreams,
    remoteStreamVersion,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    cleanup,
  };
}
