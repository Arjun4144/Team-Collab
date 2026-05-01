// client/src/components/layout/CallPanel.jsx
// Full audio/video/screen-share call UI for a channel.
// Usage: <CallPanel channelId={id} channelName={name} onLeave={fn} socket={socket} currentUser={user} />

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebRTC } from "../../hooks/useWebRTC";
import Avatar from "./Avatar";

// ─── Inline SVG icon helper ────────────────────────────────────────────────
const Icon = ({ path, size = 20, strokeWidth = 1.8, fill = "none" }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill={fill} stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
);

const PATHS = {
  mic:       "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8",
  micOff:    "M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8",
  video:     "M23 7l-7 5 7 5V7zM1 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  videoOff:  "M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10M1 1l22 22",
  monitor:   "M2 3h20a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 21h8M12 17v4",
  phoneOff:  "M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.45 19.45 0 0 1-3.77-3.77m-2.49-7.7A19.79 19.79 0 0 0 2 4.11 2 2 0 0 0 2.18 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 9.91M1 1l22 22",
  speaker:   "M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14",
  speakerOff:"M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 5l14 14M9.9 4.24A9.12 9.12 0 0 1 12 4c.34 0 .67.02 1 .07M11 5L6 9H2v6h4M19.07 4.93a10 10 0 0 1 1.6 14.02M15.54 8.46A5 5 0 0 1 17 11.23",
  hand:      "M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8l-1-4a1.5 1.5 0 0 0-3 .8L6 18a6 6 0 0 0 6 4h2a6 6 0 0 0 6-6V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2z",
  chat:      "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  users:     "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  grid:      "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  wifi:      "M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  settings:  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  send:      "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  x:         "M18 6L6 18M6 6l12 12",
};

// ─── Format call duration mm:ss ───────────────────────────────────────────
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Avatar initials from name ─────────────────────────────────────────────
function initials(name = "") {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const first = parts[0];
    if (first.length === 1) return first.toUpperCase();
    return (first[0] + first[first.length - 1]).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Deterministic color per userId ───────────────────────────────────────
const COLORS = ["#6C63FF","#FF6584","#43C6AC","#F7971E","#56CCF2","#BB86FC","#F093FB","#4FACFE","#00F2FE","#43E97B"];
function userColor(userId = "") {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ─── Video tile for one participant ───────────────────────────────────────
function VideoTile({ participant, stream, isLocal, large }) {
  const videoRef = useRef(null);
  const color = userColor(participant.userId);
  const [speaking, setSpeaking] = useState(false);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const hasVideo = stream && (!participant.videoOff || participant.screenSharing);

  // Attach stream to <video>
  useEffect(() => {
    if (videoRef.current && stream && hasVideo) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasVideo]);

  // Audio level detection for speaking indicator
  useEffect(() => {
    if (!stream || participant.muted) { setSpeaking(false); return; }
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const check = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(avg > 15);
        animFrameRef.current = requestAnimationFrame(check);
      };
      check();
      return () => {
        cancelAnimationFrame(animFrameRef.current);
        ctx.close();
      };
    } catch (_) { /* AudioContext not available in some environments */ }
  }, [stream, participant.muted]);



  return (
    <div style={{
      position: "relative",
      borderRadius: large ? 12 : 8,
      overflow: "hidden",
      background: "#3c4043",
      border: speaking
        ? `3px solid #8ab4f8`
        : "3px solid transparent",
      transition: "border-color 0.2s",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: large ? 340 : 160,
      aspectRatio: "16/9",
    }}>
      {/* Actual video */}
      {hasVideo && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", zIndex: 1,
          }}
        />
      )}

      {/* Avatar fallback when no video */}
      {!hasVideo && (
        <div style={{ zIndex: 2, position: "relative", textAlign: "center" }}>
          <div style={{
            width: large ? 96 : 56, height: large ? 96 : 56,
            borderRadius: "50%",
            background: "#5f6368",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: large ? 34 : 20, fontWeight: 500, color: "#e8eaed",
            margin: "0 auto",
            overflow: "hidden",
          }}>
            {(participant.userObject?.avatar?.url || participant.userObject?.avatar) ? (
              <img 
                src={participant.userObject.avatar.url || participant.userObject.avatar} 
                alt={participant.userName} 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
            ) : (
              initials(participant.userName)
            )}
          </div>
          <div style={{
            marginTop: 10, fontSize: large ? 14 : 11,
            color: "#e8eaed", fontWeight: 500,
          }}>
            {participant.userName}{isLocal ? " (You)" : ""}
          </div>
        </div>
      )}

      {/* Name bar over video */}
      {hasVideo && (
        <div style={{
          position: "absolute", bottom: 12, left: 12, zIndex: 3,
          background: "rgba(0,0,0,0.6)",
          borderRadius: 4, padding: "4px 8px",
          fontSize: 12, color: "#fff", fontWeight: 500,
        }}>
          {participant.userName}{isLocal ? " (You)" : ""}
        </div>
      )}

      {/* Status badges */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 3,
        display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end",
      }}>
        {participant.muted && (
          <div style={{
            background: "rgba(0,0,0,0.6)", borderRadius: "50%", padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#ea4335"
          }} title="Muted">
            <Icon path={PATHS.micOff} size={14} />
          </div>
        )}
        {participant.hand && (
          <div style={{
            background: "rgba(0,0,0,0.6)", borderRadius: "50%", padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbc04"
          }} title="Hand raised">
            <span style={{fontSize: 14}}>✋</span>
          </div>
        )}
        {participant.isHost && (
          <div style={{
            background: "rgba(0,0,0,0.6)", borderRadius: "50%", padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#8ab4f8"
          }} title="Host">
            <span style={{fontSize: 14}}>👑</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Control button ────────────────────────────────────────────────────────
function CtrlBtn({ iconPath, label, active, danger, onClick, large = true }) {
  const [hovered, setHovered] = useState(false);
  
  let bg = "#3c4043";
  let color = "#e8eaed";
  
  if (danger) {
    bg = hovered ? "#f28b82" : "#ea4335";
    color = "#fff";
  } else if (active) {
    bg = hovered ? "#aecbfa" : "#8ab4f8";
    color = "#202124";
  } else if (hovered) {
    bg = "#4a4d51";
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        background: bg, border: "none", borderRadius: "50%",
        width: large ? 56 : 40, height: large ? 56 : 40,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color,
        transition: "background 0.2s ease",
        flexShrink: 0,
      }}
    >
      <Icon path={iconPath} size={large ? 22 : 18} />
    </button>
  );
}

// ─── Chat panel ────────────────────────────────────────────────────────────
function ChatPanel({ onClose, socket, channelId, currentUser, participants }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  // Map of userId to full user object for avatar display
  const participantMap = useRef({});
  useEffect(() => {
    if (participants) {
      participants.forEach(p => {
        if (p.userObject) participantMap.current[p.userId] = p.userObject;
      });
    }
  }, [participants]);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => setMessages((m) => [...m, msg]);
    socket.on("call:chat-message", handler);
    return () => socket.off("call:chat-message", handler);
  }, [socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socket) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg = {
      id: Date.now(),
      userId: currentUser._id,
      userName: currentUser.username,
      text: input.trim(),
      time: timestamp,
    };
    // Emit with all fields so server can broadcast them
    socket.emit("call:chat-message", {
      channelId,
      id: msg.id,
      userId: msg.userId,
      userName: msg.userName,
      text: msg.text,
      time: timestamp,
    });
    setMessages((m) => [...m, msg]);
    setInput("");
  };

  return (
    <div style={{
      width: 300, display: "flex", flexDirection: "column", flexShrink: 0,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 20, overflow: "hidden",
      animation: "slideIn 0.25s ease",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          In-call Chat
        </span>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.4)",
          cursor: "pointer", display: "flex", padding: 4,
        }}>
          <Icon path={PATHS.x} size={16} />
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 20 }}>
            No messages yet
          </div>
        )}
        {messages.map((m) => {
          const color = userColor(m.userId);
          const userObj = participantMap.current[m.userId];
          return (
            <div key={m.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", animation: "fadeIn 0.2s ease" }}>
              {userObj ? (
                <Avatar user={userObj} size={28} fontSize={9} />
              ) : (
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: `linear-gradient(135deg,${color}cc,${color}44)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700,
                }}>
                  {initials(m.userName)}
                </div>
              )}
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color }}>{m.userName}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{m.time}</span>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2, lineHeight: 1.45 }}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          display: "flex", gap: 8, background: "rgba(255,255,255,0.05)",
          borderRadius: 12, padding: "8px 12px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Send a message…"
            style={{
              flex: 1, background: "none", border: "none",
              color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
          <button onClick={send} style={{
            background: "rgba(108,99,255,0.35)",
            border: "1px solid rgba(108,99,255,0.5)",
            borderRadius: 8, padding: "4px 10px",
            color: "#a89cff", cursor: "pointer", display: "flex", alignItems: "center",
          }}>
            <Icon path={PATHS.send} size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CallPanel component ──────────────────────────────────────────────
export default function CallPanel({
  channelId,
  channelName = "call",
  currentUser,   // { _id, username }
  socket,
  onLeave,
  onParticipantCountChange,
}) {
  const [layout, setLayout] = useState("grid");      // "grid" | "spotlight"
  const [chatOpen, setChatOpen] = useState(false);

  const {
    localStream, remoteStreams, participants,
    isMuted, isVideoOff, isScreenSharing, isDeafened, isHandRaised,
    callDuration, connectionStatus,
    joinCall, leaveCall,
    toggleMute, toggleVideo, toggleScreenShare, toggleDeafen, toggleHand,
  } = useWebRTC({ socket, channelId, userId: currentUser?._id, userName: currentUser?.username });

  const joinedChannelRef = useRef(null);

  // Auto-join on mount - delay slightly to ensure socket listeners are attached
  useEffect(() => {
    if (joinedChannelRef.current === channelId) return;

    const timer = setTimeout(() => {
      joinedChannelRef.current = channelId;
      joinCall();
    }, 100);
    return () => clearTimeout(timer);
  }, [joinCall, channelId]);

  // Clean up and release hardware if the user navigates away without clicking End Call
  useEffect(() => {
    return () => {
      leaveCall();
    };
  }, [leaveCall]);

  // Notify parent component of participant count changes
  useEffect(() => {
    if (onParticipantCountChange) {
      onParticipantCountChange(participants.length);
    }
  }, [participants.length, onParticipantCountChange]);

  const handleLeave = () => {
    leaveCall();
    if (onLeave) onLeave();
  };

  // Build all tiles: local + remote participants
  const localParticipant = {
    userId: currentUser?._id,
    userName: currentUser?.username,
    userObject: currentUser,
    muted: isMuted,
    videoOff: isVideoOff,
    screenSharing: isScreenSharing,
    hand: isHandRaised,
    isHost: true,
  };
  const allParticipants = [localParticipant, ...participants];
  const count = allParticipants.length;

  // Grid columns
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;

  // Spotlight: loudest speaking remote, fallback local
  const spotlightP = participants.find((p) => remoteStreams[p.userId]) || localParticipant;
  const stripP = allParticipants.filter((p) => p.userId !== spotlightP.userId);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        .call-panel * { box-sizing: border-box; margin: 0; padding: 0; }
        .call-panel { font-family: 'DM Sans', sans-serif; }
        @keyframes speakBar {
          0%,100% { opacity: 0.4; } 50% { opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          75%,100% { transform: scale(2.2); opacity: 0; }
        }
        .call-panel ::-webkit-scrollbar { width: 4px; }
        .call-panel ::-webkit-scrollbar-track { background: transparent; }
        .call-panel ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .tile-grid { display: grid; gap: 12px; }
      `}</style>

      <div className="call-panel" style={{
        display: "flex", flexDirection: "column",
        height: "100%", background: "#202124",
        color: "#fff", overflow: "hidden",
        borderRadius: 16,
      }}>

        {/* ── TOP BAR ──────────────────────────────────────────────────── */}
        <div style={{
          padding: "12px 20px", flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(255,255,255,0.02)",
          backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Live dot */}
            <div style={{ position: "relative", width: 10, height: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: connectionStatus === "connected" ? "#22c55e" : "#f59e0b",
                boxShadow: connectionStatus === "connected" ? "0 0 8px #22c55e" : "0 0 8px #f59e0b",
              }} />
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: connectionStatus === "connected" ? "#22c55e" : "#f59e0b",
                animation: "ping 1.6s ease-out infinite",
              }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}>
                # {channelName}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                {count} participant{count !== 1 ? "s" : ""} · {formatDuration(callDuration)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Quality badge */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 8, padding: "4px 10px",
              color: "#22c55e", fontSize: 11,
            }}>
              <Icon path={PATHS.wifi} size={11} /> HD
            </div>

            {/* Layout toggle */}
            <CtrlBtn
              large={false}
              iconPath={layout === "grid" ? PATHS.users : PATHS.grid}
              label={layout === "grid" ? "Focus" : "Grid"}
              onClick={() => setLayout((l) => l === "grid" ? "spotlight" : "grid")}
            />
            <CtrlBtn large={false} iconPath={PATHS.settings} label="Settings" />
          </div>
        </div>

        {/* ── CONTENT AREA ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: 14, display: "flex", gap: 12, overflow: "hidden", minHeight: 0 }}>

          {/* Video grid */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
            {layout === "spotlight" ? (
              <>
                {/* Spotlight tile */}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <VideoTile
                    participant={spotlightP}
                    stream={spotlightP.userId === currentUser?._id ? localStream : remoteStreams[spotlightP.userId]}
                    isLocal={spotlightP.userId === currentUser?._id}
                    large
                  />
                </div>
                {/* Strip */}
                {stripP.length > 0 && (
                  <div className="tile-grid" style={{
                    gridTemplateColumns: `repeat(${Math.min(stripP.length, 5)}, 1fr)`,
                    flexShrink: 0,
                  }}>
                    {stripP.map((p) => (
                      <VideoTile
                        key={p.userId}
                        participant={p}
                        stream={p.userId === currentUser?._id ? localStream : remoteStreams[p.userId]}
                        isLocal={p.userId === currentUser?._id}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="tile-grid" style={{
                flex: 1, minHeight: 0, overflow: "auto",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridAutoRows: count <= 2 ? "1fr" : "minmax(160px, 1fr)",
              }}>
                {allParticipants.map((p) => (
                  <VideoTile
                    key={p.userId}
                    participant={p}
                    stream={p.userId === currentUser?._id ? localStream : remoteStreams[p.userId]}
                    isLocal={p.userId === currentUser?._id}
                    large={count === 1}
                  />
                ))}
              </div>
            )}

            {/* Screen share banner */}
            {isScreenSharing && (
              <div style={{
                flexShrink: 0,
                background: "rgba(108,99,255,0.1)",
                border: "1px dashed rgba(108,99,255,0.5)",
                borderRadius: 14, padding: "12px 20px",
                display: "flex", alignItems: "center", gap: 10,
                color: "#a89cff", fontSize: 13,
                animation: "fadeIn 0.3s ease",
              }}>
                <Icon path={PATHS.monitor} size={18} />
                <span style={{ flex: 1 }}>You are sharing your screen</span>
                <button onClick={toggleScreenShare} style={{
                  background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 8, padding: "4px 14px", color: "#ff8080",
                  cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                }}>Stop sharing</button>
              </div>
            )}
          </div>

          {/* Chat panel */}
          {chatOpen && (
            <ChatPanel
              onClose={() => setChatOpen(false)}
              socket={socket}
              channelId={channelId}
              currentUser={currentUser}
              participants={participants}
            />
          )}
        </div>

        {/* ── CONTROL BAR ──────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          padding: "14px 24px 18px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(10,11,16,0.96)",
          backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          {/* Self info */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 150 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", position: "relative",
              background: `linear-gradient(135deg, ${userColor(currentUser?._id)}cc, ${userColor(currentUser?._id)}44)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700,
              boxShadow: !isMuted ? `0 0 0 3px ${userColor(currentUser?._id)}55` : "none",
              transition: "box-shadow 0.3s",
            }}>
              {(currentUser?.avatar?.url || currentUser?.avatar) ? (
                <img src={currentUser.avatar.url || currentUser.avatar} alt={currentUser.username} style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}} />
              ) : (
                initials(currentUser?.username)
              )}
              {!isMuted && (
                <div style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 12, height: 12, borderRadius: "50%",
                  background: "#22c55e", border: "2px solid #0a0b10",
                  zIndex: 2,
                }} />
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser?.username}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {isMuted ? "🔇 Muted" : "🎙 Live"}
              </div>
            </div>
          </div>

          {/* Main controls */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 22, padding: "10px 16px",
          }}>
            <CtrlBtn
              iconPath={isMuted ? PATHS.micOff : PATHS.mic}
              label={isMuted ? "Unmute" : "Mute"}
              active={isMuted}
              onClick={toggleMute}
            />
            <CtrlBtn
              iconPath={isVideoOff ? PATHS.videoOff : PATHS.video}
              label={isVideoOff ? "Start Cam" : "Stop Cam"}
              active={isVideoOff}
              onClick={toggleVideo}
            />
            <CtrlBtn
              iconPath={PATHS.monitor}
              label="Screen"
              active={isScreenSharing}
              onClick={toggleScreenShare}
            />
            <CtrlBtn
              iconPath={isDeafened ? PATHS.speakerOff : PATHS.speaker}
              label={isDeafened ? "Undeafen" : "Deafen"}
              active={isDeafened}
              onClick={toggleDeafen}
            />
            <CtrlBtn
              iconPath={PATHS.hand}
              label="Raise Hand"
              active={isHandRaised}
              onClick={toggleHand}
            />

            {/* Divider */}
            <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

            <CtrlBtn
              iconPath={PATHS.chat}
              label="Chat"
              active={chatOpen}
              onClick={() => setChatOpen((c) => !c)}
            />

            {/* End call */}
            <button
              onClick={handleLeave}
              title="Leave call"
              style={{
                background: "#ea4335",
                border: "none",
                borderRadius: "50%", width: 56, height: 56,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#fff",
                transition: "background 0.2s", marginLeft: 8,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f28b82"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#ea4335"; }}
            >
              <Icon path={PATHS.phoneOff} size={22} />
            </button>
          </div>

          {/* Participant avatars */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150, justifyContent: "flex-end" }}>
            <div style={{ display: "flex" }}>
              {allParticipants.slice(0, 4).map((p, i) => (
                <div key={p.userId} style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "#5f6368",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600,
                  color: "#e8eaed",
                  border: "2px solid #202124",
                  marginLeft: i === 0 ? 0 : -8,
                  zIndex: 4 - i, position: "relative", overflow: "hidden"
                }}>
                  {(p.userObject?.avatar?.url || p.userObject?.avatar) ? (
                    <img src={p.userObject.avatar.url || p.userObject.avatar} alt={p.userName} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                  ) : (
                    initials(p.userName)
                  )}
                </div>
              ))}
              {allParticipants.length > 4 && (
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "#3c4043",
                  border: "2px solid #202124", marginLeft: -8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600, color: "#e8eaed",
                  zIndex: 0, position: "relative",
                }}>
                  +{allParticipants.length - 4}
                </div>
              )}
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {count} in call
            </span>
          </div>
        </div>
      </div>
    </>
  );
}