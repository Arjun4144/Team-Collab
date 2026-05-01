/**
 * useWebRTC — WebRTC peer connection manager.
 * DEBUG BUILD — comprehensive logging at every critical point.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../utils/socket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Open Relay TURN server
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
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
  // remoteStreams: { [socketId]: { stream: MediaStream|null, userId, userName } }
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const peerConnections = useRef({});
  const pendingCandidates = useRef({});
  const makingOffer = useRef({});
  const peerMetadata = useRef({}); // { [socketId]: { userId, userName } }
  const managedStreams = useRef({}); // { [socketId]: MediaStream } — our own streams that survive replaceTrack
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
    const tracks = [videoTrackRef.current, audioTrackRef.current, screenTrackRef.current].filter(t => t && t.readyState !== 'ended');
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

    // Store peer metadata in a ref for quick lookup.
    peerMetadata.current[remoteSocketId] = { userId: remoteUserId, userName: remoteUserName };

    // Immediately add this peer to remoteStreams (with null stream) so
    // the participant count and VideoGrid show them right away, even
    // before any media tracks arrive.
    setRemoteStreams((prev) => ({
      ...prev,
      [remoteSocketId]: { stream: prev[remoteSocketId]?.stream || null, userId: remoteUserId, userName: remoteUserName },
    }));

    D(`  [DEBUG] Initializing transceivers (1 audio, 1 video) for new PC`);
    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    // store senders directly on pc
    pc._audioSender = audioTransceiver.sender;
    pc._videoSender = videoTransceiver.sender;

    // Sync existing tracks directly to the senders
    if (audioTrackRef.current) {
      pc._audioSender.replaceTrack(audioTrackRef.current);
    }
    const currentVideo = screenTrackRef.current || videoTrackRef.current;
    if (currentVideo) {
      pc._videoSender.replaceTrack(currentVideo);
    }

    // ── onnegotiationneeded (perfect negotiation pattern) ──
    pc.onnegotiationneeded = async () => {
      D(`onnegotiationneeded FIRED for ${remoteSocketId.slice(-6)} | signalingState=${pc.signalingState} | senders=${pc.getSenders().length}`);
      dumpPeerState('onnegotiationneeded', peerConnections);
      if (pc.signalingState !== 'stable') {
        D(`  Skipping offer for ${remoteSocketId.slice(-6)} because signalingState=${pc.signalingState}`);
        return;
      }

      try {
        makingOffer.current[remoteSocketId] = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        D(`  → Offer created & set. Sending to ${remoteSocketId.slice(-6)} | type=${pc.localDescription.type} | senders=${pc.getSenders().length}`);
        socket.emit('webrtc:offer', {
          channelId: channelIdRef.current,
          targetSocketId: remoteSocketId,
          offer: pc.localDescription,
        });
      } catch (err) {
        ERR('onnegotiationneeded error:', err);
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
    // CRITICAL: When transceivers are created without tracks (cam/mic off),
    // event.streams[0] is UNDEFINED (no MSID in the SDP). We must NOT
    // rely on it. Instead, we manage our own MediaStream per peer and
    // add event.track to it. When the sender later calls replaceTrack(),
    // media flows through the SAME track object — the video element
    // picks it up automatically without needing another ontrack event.
    pc.ontrack = (event) => {
      D(`  → ontrack from ${remoteSocketId.slice(-6)} | track=${event.track.kind} id=${event.track.id.slice(-6)} readyState=${event.track.readyState} streams=${event.streams?.length || 0}`);

      // Get or create a managed MediaStream for this peer
      if (!managedStreams.current[remoteSocketId]) {
        managedStreams.current[remoteSocketId] = new MediaStream();
      }
      const peerStream = managedStreams.current[remoteSocketId];

      // Remove any existing track of the same kind before adding the new one
      peerStream.getTracks()
        .filter(t => t.kind === event.track.kind)
        .forEach(t => peerStream.removeTrack(t));
      peerStream.addTrack(event.track);

      D(`  → Managed stream now has: ${peerStream.getTracks().map(t => `${t.kind}(${t.readyState})`).join(', ')}`);

      // Update state — the same peerStream reference is reused, but
      // we create a new state object so React triggers a re-render.
      setRemoteStreams((prev) => {
        const existing = prev[remoteSocketId] || {};
        return {
          ...prev,
          [remoteSocketId]: {
            ...existing,
            stream: peerStream,
            userId: existing.userId || remoteUserId,
            userName: existing.userName || remoteUserName,
          },
        };
      });
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
    const pcs = Object.entries(peerConnections.current);
    const socket = getSocket();

    D(`syncTrackToAllPeers: ${track.kind} track to ${pcs.length} peers`);

    pcs.forEach(([socketId, pc]) => {
      let sender = null;

      if (track.kind === 'audio') sender = pc._audioSender;
      if (track.kind === 'video') sender = pc._videoSender;

      if (!sender) {
        console.warn(`[WebRTC] Missing sender for ${track.kind} on ${socketId}`);
        return;
      }

      const prevTrackId = sender.track?.id || 'null';

      sender.replaceTrack(track).then(async () => {
        D(`replaceTrack OK: ${track.kind} on ${socketId.slice(-6)} | prev=${prevTrackId} → new=${track.id.slice(-6)}`);

        // Ensure the transceiver direction is sendrecv
        const transceiver = pc.getTransceivers().find(t => t.sender === sender);
        if (transceiver && transceiver.direction !== 'sendrecv') {
          D(`  Fixing direction: ${transceiver.direction} → sendrecv`);
          transceiver.direction = 'sendrecv';
        }

        // ALWAYS force renegotiation after replaceTrack.
        // Screen share works because some browsers auto-renegotiate for
        // getDisplayMedia tracks; camera tracks don't get that treatment.
        // Explicit renegotiation guarantees the remote peer activates
        // its receiver pipeline for the new track.
        if (!socket) return;

        // ── Glare prevention ──
        // Only ONE peer should send the renegotiation offer.
        // The peer with the higher socket.id is the designated offerer.
        // This prevents simultaneous offers (glare) that cause cross-browser failures.
        const shouldOffer = socket.id > socketId;
        if (!shouldOffer) {
          D(`  Skipping renegotiation for ${socketId.slice(-6)} (not the offerer, my=${socket.id.slice(-6)})`);
          return;
        }

        // Wait for stable state if currently negotiating
        const waitForStable = () => new Promise((resolve) => {
          if (pc.signalingState === 'stable') return resolve();
          D(`  Waiting for stable state (current: ${pc.signalingState})`);
          const handler = () => {
            if (pc.signalingState === 'stable') {
              pc.removeEventListener('signalingstatechange', handler);
              resolve();
            }
          };
          pc.addEventListener('signalingstatechange', handler);
          // Safety timeout — don't wait forever
          setTimeout(() => {
            pc.removeEventListener('signalingstatechange', handler);
            resolve();
          }, 3000);
        });

        await waitForStable();

        if (pc.signalingState !== 'stable') {
          WARN(`  Skipping renegotiation for ${socketId.slice(-6)}: stuck in ${pc.signalingState}`);
          return;
        }

        D(`  → Renegotiating with ${socketId.slice(-6)} after replaceTrack`);
        try {
          makingOffer.current[socketId] = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          D(`  → Offer sent to ${socketId.slice(-6)}`);
          socket.emit('webrtc:offer', {
            channelId: channelIdRef.current,
            targetSocketId: socketId,
            offer: pc.localDescription,
          });
        } catch (err) {
          ERR('Renegotiation after replaceTrack failed:', err);
        } finally {
          makingOffer.current[socketId] = false;
        }
      }).catch(err =>
        console.error('[WebRTC] replaceTrack error:', err)
      );
    });
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
      screenTrackRef.current = null;
    }

    // Restore camera track to the video sender
    const cameraTrack = previousVideoTrackRef.current || videoTrackRef.current;
    if (cameraTrack && cameraTrack.readyState === 'live') {
      D(`  Restoring camera track id=${cameraTrack.id.slice(-6)}`);
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
      createPeerConnection(socketId, userId, userName);
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
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
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
        // Flush any ICE candidates that arrived before the answer
        if (pendingCandidates.current[fromSocketId]) {
          D(`  Flushing ${pendingCandidates.current[fromSocketId].length} queued ICE candidates after answer`);
          for (const c of pendingCandidates.current[fromSocketId]) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
          }
          delete pendingCandidates.current[fromSocketId];
        }
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
      delete peerMetadata.current[socketId];
      delete managedStreams.current[socketId];
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
      // Force a re-render by updating version
      D(`  Remaining remote peers: ${Object.keys(peerConnections.current).length}`);
      D(`  PCs remaining: ${Object.keys(peerConnections.current).length}`);
    };

    const onParticipants = ({ participants }) => {
      D(`EVENT call:participants | count=${participants.length} | myId=${socket.id.slice(-6)}`);
      if (!inCallRef.current) return;
      const mySocketId = socket.id;
      participants.forEach((p) => {
        D(`  participant: ${p.userName}(${p.socketId.slice(-6)}) | isMe=${p.socketId === mySocketId} | pcExists=${!!peerConnections.current[p.socketId]}`);
        if (p.socketId !== mySocketId && !peerConnections.current[p.socketId]) {
          D(`  → Creating PC for ${p.socketId.slice(-6)} (both sides create; perfect negotiation handles collisions)`);
          createPeerConnection(p.socketId, p.userId, p.userName);
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
    peerMetadata.current = {};
    managedStreams.current = {};
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
    peerMetadata,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    cleanup,
  };
}
