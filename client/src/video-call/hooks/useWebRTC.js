/**
 * useWebRTC — WebRTC peer connection manager.
 * DEBUG BUILD — comprehensive logging at every critical point.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../utils/socket';

const ICE_SERVERS = [
  // ── STUN (public IP discovery) ──
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // ── TURN (relay for NAT traversal — REQUIRED for cross-machine calls) ──
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// ── Debug logger ──────────────────────────────────────────────
const D = (...args) => console.log('%c[WebRTC]', 'color:#0ea5e9;font-weight:bold', ...args);
const WARN = (...args) => console.warn('%c[WebRTC]', 'color:#f59e0b;font-weight:bold', ...args);
const ERR = (...args) => console.error('%c[WebRTC]', 'color:#ef4444;font-weight:bold', ...args);

function dumpPeerState(label, peerConnections) {
  const pcs = Object.entries(peerConnections.current);
  D(`── ${label} ── Total PCs: ${pcs.length}`);
  pcs.forEach(([sid, pc]) => {
    const senders = pc.getSenders().map(s => `${s.track?.kind || 'null'}(enabled=${s.track?.enabled},state=${s.track?.readyState})`);
    const receivers = pc.getReceivers().map(r => `${r.track?.kind || 'null'}(state=${r.track?.readyState})`);
    D(`  PC[${sid.slice(-6)}] signaling=${pc.signalingState} ice=${pc.iceConnectionState} senders=[${senders}] receivers=[${receivers}]`);
  });
}

export default function useWebRTC(channelId, inCall) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const peerConnections = useRef({});
  const pendingCandidates = useRef({});
  const makingOffer = useRef({});
  const videoTrackRef = useRef(null);
  const audioTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const previousVideoTrackRef = useRef(null);
  const localMediaStream = useRef(new MediaStream());
  const inCallRef = useRef(inCall);
  const channelIdRef = useRef(channelId);
  const isCameraOnRef = useRef(false);
  const isMicOnRef = useRef(false);
  const isScreenSharingRef = useRef(false);

  inCallRef.current = inCall;
  channelIdRef.current = channelId;

  // ── Helpers ──────────────────────────────────────────────────

  const refreshLocalStream = useCallback(() => {
    const tracks = localMediaStream.current.getTracks();
    D('refreshLocalStream:', tracks.map(t => `${t.kind}(enabled=${t.enabled})`));
    setLocalStream(tracks.length > 0 ? new MediaStream(tracks) : null);
  }, []);

  const broadcastMediaState = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    D('broadcastMediaState: camera=', isCameraOnRef.current, 'mic=', isMicOnRef.current, 'screen=', isScreenSharingRef.current);
    socket.emit('call:media-state', {
      channelId: channelIdRef.current,
      isCameraOn: isCameraOnRef.current || isScreenSharingRef.current,
      isMicOn: isMicOnRef.current,
      isScreenSharing: isScreenSharingRef.current,
    });
  }, []);

  // ── Peer Connection Factory ──────────────────────────────────

  const createPeerConnection = useCallback((remoteSocketId, remoteUserId, remoteUserName) => {
    if (peerConnections.current[remoteSocketId]) {
      D(`createPeerConnection: REUSING existing PC for ${remoteSocketId.slice(-6)}`);
      return peerConnections.current[remoteSocketId];
    }

    const socket = getSocket();
    const polite = socket.id < remoteSocketId;
    D(`createPeerConnection: NEW PC for ${remoteSocketId.slice(-6)} (${remoteUserName}) | myId=${socket.id.slice(-6)} | polite=${polite}`);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections.current[remoteSocketId] = pc;
    makingOffer.current[remoteSocketId] = false;

    // We rely entirely on native event.streams binding rather than manual stream mutation.
    setRemoteStreams((prev) => ({
      ...prev,
      [remoteSocketId]: {
        stream: null, // will be bound from event.streams[0]
        userId: remoteUserId,
        userName: remoteUserName,
      },
    }));

    D(`  [DEBUG] Initializing transceivers (1 audio, 1 video) for new PC`);
    pc.addTransceiver('audio', { direction: 'recvonly', streams: [localMediaStream.current] });
    pc.addTransceiver('video', { direction: 'recvonly', streams: [localMediaStream.current] });

    if (localMediaStream.current) {
      const activeTracks = localMediaStream.current.getTracks();
      D(`  [DEBUG] Attaching ${activeTracks.length} existing tracks to transceivers via replaceTrack [${activeTracks.map(t => t.kind).join(',')}]`);
      activeTracks.forEach(track => {
        const transceiver = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === track.kind);
        if (transceiver && transceiver.sender) {
          transceiver.sender.replaceTrack(track);
          transceiver.direction = 'sendrecv';
        }
      });
    }

    // ── onnegotiationneeded (perfect negotiation pattern) ──
    pc.onnegotiationneeded = async () => {
      D(`onnegotiationneeded FIRED for ${remoteSocketId.slice(-6)} | signalingState=${pc.signalingState} | senders=${pc.getSenders().length}`);
      dumpPeerState('onnegotiationneeded', peerConnections);
      try {
        makingOffer.current[remoteSocketId] = true;
        await pc.setLocalDescription();
        D(`  → Offer created & set. Sending to ${remoteSocketId.slice(-6)} | type=${pc.localDescription.type} | senders=${pc.getSenders().length}`);
        socket.emit('webrtc:offer', {
          channelId: channelIdRef.current,
          targetSocketId: remoteSocketId,
          offer: pc.localDescription,
        });
      } catch (err) {
        ERR('onnegotiationneeded error (will retry in 500ms):', err);
        setTimeout(() => {
          if (pc.signalingState !== 'closed') {
            D(`Retrying onnegotiationneeded for ${remoteSocketId.slice(-6)}`);
            pc.dispatchEvent(new Event('negotiationneeded'));
          }
        }, 500);
      } finally {
        makingOffer.current[remoteSocketId] = false;
      }
    };

    // ── ICE Candidates ──
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        D(`ICE candidate for ${remoteSocketId.slice(-6)} | type=${event.candidate.type} protocol=${event.candidate.protocol} address=${event.candidate.address || 'hidden'}`);
        socket.emit('webrtc:ice-candidate', {
          channelId: channelIdRef.current,
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      } else if (!event.candidate) {
        D(`ICE gathering complete for ${remoteSocketId.slice(-6)}`);
      }
    };

    // ── Remote tracks ──
    pc.ontrack = (event) => {
      D(`  → [DEBUG] ontrack FIRED from ${remoteSocketId.slice(-6)} | track=${event.track.kind} id=${event.track.id.slice(-6)} streams=${event.streams.length}`);
      if (event.streams && event.streams[0]) {
        D(`  Binding stream ID: ${event.streams[0].id}`);
        setRemoteStreams((prev) => ({
          ...prev,
          [remoteSocketId]: {
            ...prev[remoteSocketId],
            stream: event.streams[0],
          },
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      D(`ICE connection state for ${remoteSocketId.slice(-6)}: ${pc.iceConnectionState}`);
      // Auto ICE restart on failure
      if (pc.iceConnectionState === 'failed') {
        WARN(`ICE failed for ${remoteSocketId.slice(-6)} — attempting ICE restart`);
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      D(`Connection state for ${remoteSocketId.slice(-6)}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        ERR(`Connection FAILED for ${remoteSocketId.slice(-6)} — peer may be unreachable`);
      }
    };

    pc.onicegatheringstatechange = () => {
      D(`ICE gathering state for ${remoteSocketId.slice(-6)}: ${pc.iceGatheringState}`);
    };

    pc.onsignalingstatechange = () => {
      D(`Signaling state change for ${remoteSocketId.slice(-6)}: ${pc.signalingState}`);
    };

    // Flush queued ICE candidates
    if (pendingCandidates.current[remoteSocketId]) {
      D(`  Flushing ${pendingCandidates.current[remoteSocketId].length} queued ICE candidates`);
      pendingCandidates.current[remoteSocketId].forEach((c) => {
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      });
      delete pendingCandidates.current[remoteSocketId];
    }

    D(`  PC created. Total PCs now: ${Object.keys(peerConnections.current).length}`);
    return pc;
  }, []);

  // ── Sync a track to ALL peer connections ─────────────────────
  // oldTrack: if provided, find the sender that currently carries this exact track
  //           and replace it. If null, find by kind OR add a new sender.

  const syncTrackToAllPeers = useCallback((track) => {
    const pcEntries = Object.entries(peerConnections.current);
    D(`syncTrackToAllPeers: track=${track.kind} id=${track.id.slice(-6)} enabled=${track.enabled} | peerCount=${pcEntries.length}`);

    pcEntries.forEach(([socketId, pc]) => {
      const transceivers = pc.getTransceivers();
      // Find the specific transceiver for this media kind
      const transceiver = transceivers.find(t => t.receiver && t.receiver.track && t.receiver.track.kind === track.kind);

      if (transceiver && transceiver.sender) {
        D(`  → [DEBUG] replaceTrack on existing ${track.kind} transceiver for ${socketId.slice(-6)}`);
        transceiver.sender.replaceTrack(track).catch(err => ERR('  replaceTrack error:', err));

        // Ensure transceiver allows sending
        if (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive') {
          transceiver.direction = transceiver.direction === 'recvonly' ? 'sendrecv' : 'sendonly';
          D(`  → [DEBUG] Changed transceiver direction to ${transceiver.direction}`);
        }
      } else {
        WARN(`  No ${track.kind} transceiver found for ${socketId.slice(-6)}. Cannot sync track. Ensure transceivers are initialized on PC creation.`);
      }
    });

    dumpPeerState('After syncTrackToAllPeers', peerConnections);
  }, []);

  // ── Toggle Camera ────────────────────────────────────────────

  const toggleCamera = useCallback(async () => {
    D(`toggleCamera called | current isCameraOn=${isCameraOnRef.current}`);

    if (!isCameraOnRef.current) {
      if (!videoTrackRef.current || videoTrackRef.current.readyState === 'ended') {
        D('  Acquiring new video track via getUserMedia...');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          });
          D(`  → [DEBUG] getUserMedia RESOLVED (video)`);
          const track = stream.getVideoTracks()[0];
          D(`  Got video track: id=${track.id} enabled=${track.enabled} readyState=${track.readyState}`);
          videoTrackRef.current = track;
          // Replace all video tracks in local stream with the new camera track
          localMediaStream.current.getVideoTracks().forEach(t => localMediaStream.current.removeTrack(t));
          localMediaStream.current.addTrack(track);
          D(`  localMediaStream now has ${localMediaStream.current.getTracks().length} tracks`);
          syncTrackToAllPeers(track);
        } catch (err) {
          ERR('Camera error:', err);
          return;
        }
      } else {
        D('  Re-enabling existing video track');
        videoTrackRef.current.enabled = true;
      }
      // If screen share was active, turning on camera replaces it
      if (isScreenSharingRef.current) {
        D('  Camera toggled while screen sharing — stopping screen share');
        if (screenTrackRef.current) { screenTrackRef.current.stop(); screenTrackRef.current = null; }
        isScreenSharingRef.current = false;
        setIsScreenSharing(false);
        previousVideoTrackRef.current = null;
      }
      isCameraOnRef.current = true;
      setIsCameraOn(true);
    } else {
      D('  Disabling video track');
      if (videoTrackRef.current) videoTrackRef.current.enabled = false;
      isCameraOnRef.current = false;
      setIsCameraOn(false);
    }
    refreshLocalStream();
    broadcastMediaState();
    dumpPeerState('After toggleCamera', peerConnections);
  }, [syncTrackToAllPeers, refreshLocalStream, broadcastMediaState]);

  // ── Toggle Screen Share ──────────────────────────────────────

  const toggleScreenShare = useCallback(async () => {
    D(`toggleScreenShare called | current isScreenSharing=${isScreenSharingRef.current}`);

    if (!isScreenSharingRef.current) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        
        screenTrack.onended = () => {
          D('Screen share ended by browser');
          stopScreenShare();
        };

        screenTrackRef.current = screenTrack;
        // Save current camera track for restoration later
        previousVideoTrackRef.current = videoTrackRef.current;

        // Replace video in local stream with screen track
        localMediaStream.current.getVideoTracks().forEach(t => localMediaStream.current.removeTrack(t));
        localMediaStream.current.addTrack(screenTrack);
        D(`  Replaced video sender with screen track. localMediaStream tracks: ${localMediaStream.current.getTracks().length}`);

        // Replace the existing video sender on all peers (NOT addTrack)
        syncTrackToAllPeers(screenTrack);
        
        isScreenSharingRef.current = true;
        setIsScreenSharing(true);
        refreshLocalStream();
        broadcastMediaState();
        dumpPeerState('After startScreenShare', peerConnections);
      } catch (err) {
        ERR('Screen share error:', err);
      }
    } else {
      stopScreenShare();
    }
  }, [syncTrackToAllPeers, refreshLocalStream, broadcastMediaState]);

  // ── Stop Screen Share (reused by onended + manual stop) ──
  const stopScreenShare = useCallback(() => {
    D('stopScreenShare called');
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
    
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      localMediaStream.current.getVideoTracks().forEach(t => localMediaStream.current.removeTrack(t));
      screenTrackRef.current = null;
    }

    // Restore camera track to the video sender
    const cameraTrack = previousVideoTrackRef.current || videoTrackRef.current;
    if (cameraTrack && cameraTrack.readyState === 'live') {
      D(`  Restoring camera track id=${cameraTrack.id.slice(-6)}`);
      localMediaStream.current.addTrack(cameraTrack);
      syncTrackToAllPeers(cameraTrack);
      isCameraOnRef.current = true;
      setIsCameraOn(true);
    } else {
      D('  No live camera track to restore');
      isCameraOnRef.current = false;
      setIsCameraOn(false);
    }
    previousVideoTrackRef.current = null;

    refreshLocalStream();
    broadcastMediaState();
    dumpPeerState('After stopScreenShare', peerConnections);
  }, [syncTrackToAllPeers, refreshLocalStream, broadcastMediaState]);

  // ── Toggle Mic ───────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    D(`toggleMic called | current isMicOn=${isMicOnRef.current}`);

    if (!isMicOnRef.current) {
      if (!audioTrackRef.current || audioTrackRef.current.readyState === 'ended') {
        D('  Acquiring new audio track...');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          D(`  → [DEBUG] getUserMedia RESOLVED (audio)`);
          const track = stream.getAudioTracks()[0];
          D(`  Got audio track: id=${track.id}`);
          audioTrackRef.current = track;
          localMediaStream.current.getAudioTracks().forEach((t) => localMediaStream.current.removeTrack(t));
          localMediaStream.current.addTrack(track);
          syncTrackToAllPeers(track);
        } catch (err) {
          ERR('Mic error:', err);
          return;
        }
      } else {
        audioTrackRef.current.enabled = true;
      }
      isMicOnRef.current = true;
      setIsMicOn(true);
    } else {
      if (audioTrackRef.current) audioTrackRef.current.enabled = false;
      isMicOnRef.current = false;
      setIsMicOn(false);
    }
    refreshLocalStream();
    broadcastMediaState();
  }, [syncTrackToAllPeers, refreshLocalStream, broadcastMediaState]);

  // ── Socket Event Handlers ────────────────────────────────────

  useEffect(() => {
    if (!inCall || !channelId) return;
    const socket = getSocket();
    if (!socket) return;

    D(`=== useEffect MOUNTED === mySocketId=${socket.id} channelId=${channelId}`);

    const onUserJoined = async ({ socketId, userId, userName }) => {
      D(`EVENT call:user-joined | who=${userName}(${socketId.slice(-6)})`);
      if (!inCallRef.current) { WARN('  Not in call, ignoring'); return; }
      const pc = createPeerConnection(socketId, userId, userName);
      if (pc.getSenders().length === 0) {
        D('  No senders → sending explicit initial offer');
        try {
          makingOffer.current[socketId] = true;
          await pc.setLocalDescription();
          D(`  → Initial offer sent to ${socketId.slice(-6)}`);
          socket.emit('webrtc:offer', {
            channelId: channelIdRef.current,
            targetSocketId: socketId,
            offer: pc.localDescription,
          });
        } catch (err) {
          ERR('Initial offer error:', err);
        } finally {
          makingOffer.current[socketId] = false;
        }
      } else {
        D(`  ${pc.getSenders().length} senders exist → onnegotiationneeded will fire from addTrack`);
      }
      broadcastMediaState();
    };

    const onOffer = async ({ fromSocketId, fromUserId, fromUserName, offer }) => {
      D(`EVENT webrtc:offer from ${fromUserName}(${fromSocketId.slice(-6)}) | offer.type=${offer.type}`);
      if (!inCallRef.current) { WARN('  Not in call, ignoring'); return; }

      const pc = createPeerConnection(fromSocketId, fromUserId, fromUserName);
      const polite = socket.id < fromSocketId;
      const offerCollision = makingOffer.current[fromSocketId] || pc.signalingState !== 'stable';

      D(`  polite=${polite} offerCollision=${offerCollision} makingOffer=${makingOffer.current[fromSocketId]} signalingState=${pc.signalingState}`);

      if (offerCollision) {
        if (!polite) {
          WARN('  IMPOLITE: ignoring their offer (ours wins)');
          return;
        }
        D('  POLITE: rolling back our offer');
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (err) {
          ERR('Rollback error:', err);
          return;
        }
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        D(`  Remote description set. Creating answer...`);
        await pc.setLocalDescription();
        D(`  → Answer sent to ${fromSocketId.slice(-6)} | type=${pc.localDescription.type}`);
        socket.emit('webrtc:answer', {
          channelId: channelIdRef.current,
          targetSocketId: fromSocketId,
          answer: pc.localDescription,
        });
      } catch (err) {
        ERR('Answer error:', err);
      }
      dumpPeerState('After onOffer', peerConnections);
    };

    const onAnswer = async ({ fromSocketId, answer }) => {
      D(`EVENT webrtc:answer from ${fromSocketId.slice(-6)} | signalingState=${peerConnections.current[fromSocketId]?.signalingState}`);
      const pc = peerConnections.current[fromSocketId];
      if (!pc) { WARN('  No PC found!'); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        D(`  Remote description set successfully. signalingState=${pc.signalingState}`);
      } catch (err) {
        WARN('  setRemoteDescription(answer) failed:', err.message);
      }
    };

    const onIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {}
      } else {
        if (!pendingCandidates.current[fromSocketId]) pendingCandidates.current[fromSocketId] = [];
        pendingCandidates.current[fromSocketId].push(candidate);
      }
    };

    const onUserLeft = ({ socketId }) => {
      D(`EVENT call:user-left | ${socketId.slice(-6)}`);
      if (peerConnections.current[socketId]) {
        peerConnections.current[socketId].close();
        delete peerConnections.current[socketId];
      }
      delete pendingCandidates.current[socketId];
      delete makingOffer.current[socketId];
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      D(`  PCs remaining: ${Object.keys(peerConnections.current).length}`);
    };

    const onParticipants = ({ participants }) => {
      D(`EVENT call:participants | count=${participants.length} | myId=${socket.id.slice(-6)}`);
      if (!inCallRef.current) return;
      const mySocketId = socket.id;
      participants.forEach((p) => {
        D(`  participant: ${p.userName}(${p.socketId.slice(-6)}) | isMe=${p.socketId === mySocketId} | pcExists=${!!peerConnections.current[p.socketId]}`);
        if (p.socketId !== mySocketId && !peerConnections.current[p.socketId]) {
          const shouldOffer = mySocketId > p.socketId;
          D(`  → shouldOffer=${shouldOffer} (myId=${mySocketId.slice(-6)} vs ${p.socketId.slice(-6)})`);
          if (shouldOffer) {
            const pc = createPeerConnection(p.socketId, p.userId, p.userName);
            if (pc.getSenders().length === 0) {
              D(`  → Sending explicit initial offer (no senders)`);
              (async () => {
                try {
                  makingOffer.current[p.socketId] = true;
                  await pc.setLocalDescription();
                  socket.emit('webrtc:offer', {
                    channelId: channelIdRef.current,
                    targetSocketId: p.socketId,
                    offer: pc.localDescription,
                  });
                  D(`  → Initial offer sent to ${p.socketId.slice(-6)}`);
                } catch (err) {
                  ERR('Initial offer error:', err);
                } finally {
                  makingOffer.current[p.socketId] = false;
                }
              })();
            } else {
              D(`  → ${pc.getSenders().length} senders → onnegotiationneeded will fire`);
            }
          } else {
            D(`  → Waiting for THEM to send us an offer`);
          }
        }
      });
      broadcastMediaState();
    };

    socket.on('call:user-joined', onUserJoined);
    socket.on('call:user-left', onUserLeft);
    socket.on('call:participants', onParticipants);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice-candidate', onIceCandidate);

    return () => {
      D('=== useEffect CLEANUP === (removing socket listeners)');
      socket.off('call:user-joined', onUserJoined);
      socket.off('call:user-left', onUserLeft);
      socket.off('call:participants', onParticipants);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice-candidate', onIceCandidate);
    };
  }, [inCall, channelId, createPeerConnection, broadcastMediaState]);

  // ── Cleanup ──────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    D('=== CLEANUP called ===');
    Object.values(peerConnections.current).forEach((pc) => {
      try { pc.close(); } catch {}
    });
    peerConnections.current = {};
    pendingCandidates.current = {};
    makingOffer.current = {};
    if (videoTrackRef.current) { videoTrackRef.current.stop(); videoTrackRef.current = null; }
    if (audioTrackRef.current) { audioTrackRef.current.stop(); audioTrackRef.current = null; }
    if (screenTrackRef.current) { screenTrackRef.current.stop(); screenTrackRef.current = null; }
    localMediaStream.current = new MediaStream();
    setLocalStream(null);
    setRemoteStreams({});
    setIsCameraOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
    isCameraOnRef.current = false;
    isMicOnRef.current = false;
    isScreenSharingRef.current = false;
  }, []);

  return {
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    cleanup,
  };
}
