// client/src/components/layout/CallButton.jsx
// A small "Start Call" button to embed in ChannelHeader.
// When clicked it shows/hides the CallPanel overlay inside the channel view.

import { useState } from "react";

const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07
             19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67
             A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72
             c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11
             L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45
             c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export default function CallButton({ onClick, active }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={active ? "Leave call" : "Start / join call"}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 10, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
        transition: "all 0.2s ease",
        background: active
          ? (hovered ? "rgba(239,68,68,0.55)" : "rgba(239,68,68,0.2)")
          : (hovered ? "rgba(34,197,94,0.3)"  : "rgba(34,197,94,0.15)"),
        border: active
          ? "1px solid rgba(239,68,68,0.5)"
          : "1px solid rgba(34,197,94,0.4)",
        color: active ? "#ff8080" : "#4ade80",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered
          ? active ? "0 4px 14px rgba(239,68,68,0.3)" : "0 4px 14px rgba(34,197,94,0.25)"
          : "none",
      }}
    >
      <PhoneIcon />
      {active ? "Leave Call" : "Join Call"}
      {active && (
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#ff7070",
          boxShadow: "0 0 6px #ff7070",
          animation: "callPing 1.5s ease-out infinite",
        }} />
      )}
      <style>{`
        @keyframes callPing {
          0%   { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </button>
  );
}