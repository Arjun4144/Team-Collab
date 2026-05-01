import React, { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import CallPanel from './CallPanel';

// Hook for window width to determine overflow
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return width;
}

// Hook to detect clicks outside the overflow dropdown
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

const DropdownItem = ({ action, active, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={() => onClick(action.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.dropdownBtn,
        ...(active ? styles.dropdownBtnActive : {}),
        ...(isHovered && !active ? { background: 'var(--bg-elevated)' } : {})
      }}
    >
      {action.label}
    </button>
  );
};

// ── Phone SVG icon ────────────────────────────────────────────────────────────
const PhoneIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07
             19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1
             4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0
             0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0
             1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const PhoneOffIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45
             c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2
             19.79 19.79 0 0 1-8.63-3.07 19.45 19.45 0 0 1-3.77-3.77
             m-2.49-7.7A19.79 19.79 0 0 0 2 4.11 2 2 0 0 0 2.18 2h3a2 2 0 0
             1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.09 9.91
             M1 1l22 22" />
  </svg>
);

export default function ChannelHeader() {
  const { activeChannel, activeWorkspace, setRightPanel, rightPanel, users, user, tasks, socket } = useStore();

  const isWsOwner = (activeWorkspace?.createdBy?._id || activeWorkspace?.createdBy)?.toString() === user?._id?.toString();
  const isWsAdmin = activeWorkspace?.admins?.some(a => (typeof a === 'object' ? a._id : a)?.toString() === user?._id?.toString());
  const isChAdmin = activeChannel?.admins?.some(a => (typeof a === 'object' ? a._id : a)?.toString() === user?._id?.toString());
  const myRole = isWsOwner ? 'Owner' : ((isWsAdmin || isChAdmin) ? 'Admin' : 'Member');

  const width = useWindowWidth();
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef(null);

  // ── Call state ──────────────────────────────────────────────────────────────
  const [callActive, setCallActive] = useState(false);
  const [callBtnHovered, setCallBtnHovered] = useState(false);
  const [ongoingCallCount, setOngoingCallCount] = useState(0);

  useOnClickOutside(overflowRef, () => setShowOverflow(false));

  // Close call if channel changes
  useEffect(() => { setCallActive(false); }, [activeChannel?._id]);

  // Listen for call participant count updates from server
  useEffect(() => {
    if (!socket) return;
    
    const handleParticipantCountUpdate = ({ count }) => {
      setOngoingCallCount(count);
    };
    
    socket.on('call:participants-count', handleParticipantCountUpdate);
    return () => socket.off('call:participants-count', handleParticipantCountUpdate);
  }, [socket]);

  const lastSeenTasks = parseInt(localStorage.getItem('nexus_lastSeenTasks') || '0', 10);
  const unseenTasks = (tasks || []).filter(t =>
    (t.assignee?._id === user?._id || t.assignee === user?._id) &&
    new Date(t.updatedAt).getTime() > lastSeenTasks &&
    t.status !== 'done'
  ).length;

  if (!activeChannel) return null;

  const statusMap = new Map(users.map(u => [u._id, u.status]));
  const memberList = activeWorkspace?.members || activeChannel?.members || [];
  const totalMembers = memberList.length;
  const onlineMembers = memberList.filter(u => statusMap.get(u?._id || u) === 'online').length;

  const ALL_ACTIONS = [
    { id: 'tasks',     label: `⚡ Tasks ${unseenTasks > 0 ? `(${unseenTasks})` : ''}` },
    { id: 'decisions', label: '✅ Decisions' },
    { id: 'members',   label: '👥 Members' },
  ];

  let visibleActions = ALL_ACTIONS;
  let overflowActions = [];

  if (width < 900) {
    visibleActions  = [ALL_ACTIONS[0]];
    overflowActions = [ALL_ACTIONS[1], ALL_ACTIONS[2]];
  }
  if (width < 700) {
    visibleActions  = [];
    overflowActions = ALL_ACTIONS;
  }

  const handleActionClick = (id) => {
    if (id === 'tasks') {
      localStorage.setItem('nexus_lastSeenTasks', Date.now().toString());
    }
    setRightPanel(id);
    setShowOverflow(false);
  };

  return (
    <>
      {/* ── HEADER BAR ─────────────────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.left}>
          <span style={styles.hash}>#</span>
          <div style={styles.titleStack}>
            <div style={styles.nameRow}>
              <h1 style={styles.name}>{activeChannel.name}</h1>
              <span style={styles.roleBadge}>{myRole}</span>

              {/* Live call indicator in title row — visible when call is active */}
              {callActive && (
                <span style={styles.liveCallBadge}>
                  <span style={styles.liveDot} />
                  Live
                </span>
              )}
            </div>
            {activeChannel.description && (
              <p style={styles.desc}>{activeChannel.description}</p>
            )}
          </div>
        </div>

        <div style={styles.right}>
          {width > 800 && (
            <span style={styles.memberCount}>
              👥 {totalMembers} · <span style={{ color: '#10b981' }}>●</span> {onlineMembers}
            </span>
          )}

          {/* ── CALL BUTTON ─────────────────────────────────────────────── */}
          <button
            onClick={() => setCallActive(v => !v)}
            onMouseEnter={() => setCallBtnHovered(true)}
            onMouseLeave={() => setCallBtnHovered(false)}
            style={{
              ...styles.btn,
              ...(callActive ? styles.callBtnActive : (ongoingCallCount > 0 ? styles.callBtnWithParticipants : styles.callBtnIdle)),
              ...(callBtnHovered && !callActive ? styles.callBtnHover : {}),
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title={callActive ? 'Leave call' : (ongoingCallCount > 0 ? `Join call (${ongoingCallCount} ${ongoingCallCount === 1 ? 'person' : 'people'} in call)` : 'Start / join call')}
          >
            {callActive ? <PhoneOffIcon /> : <PhoneIcon />}
            {width > 600 && (callActive ? 'Leave Call' : (ongoingCallCount > 0 ? `Join (${ongoingCallCount})` : 'Call'))}
            {(callActive || ongoingCallCount > 0) && <span style={styles.callPulseDot} />}
          </button>

          {/* ── ACTION BUTTONS ───────────────────────────────────────────── */}
          {visibleActions.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleActionClick(id)}
              style={{ ...styles.btn, ...(rightPanel === id ? styles.btnActive : {}) }}
            >
              {label}
            </button>
          ))}

          {overflowActions.length > 0 && (
            <div style={styles.overflowContainer} ref={overflowRef}>
              <button
                onClick={() => setShowOverflow(!showOverflow)}
                style={{ ...styles.btn, ...(showOverflow ? styles.btnActive : {}) }}
              >
                +{overflowActions.length}
              </button>
              {showOverflow && (
                <div style={styles.dropdown}>
                  {overflowActions.map((action) => (
                    <DropdownItem
                      key={action.id}
                      action={action}
                      active={rightPanel === action.id}
                      onClick={handleActionClick}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── CALL PANEL OVERLAY ──────────────────────────────────────────────── */}
      {callActive && (
        <div style={styles.callOverlay}>
          <div style={styles.callModal}>
            <CallPanel
              channelId={activeChannel._id}
              channelName={activeChannel.name}
              currentUser={user}
              socket={socket}
              onLeave={() => setCallActive(false)}
              onParticipantCountChange={setOngoingCallCount}
            />
          </div>
        </div>
      )}

      {/* Pulse animation keyframe */}
      <style>{`
        @keyframes nexus-call-ping {
          0%   { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes nexus-live-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}

const styles = {
  header: {
    height: 60,
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
    gap: 20,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  titleStack: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
    flex: 1,
    gap: 1,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  hash:  { fontSize: 18, color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 },
  name:  {
    fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
    fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.4,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  roleBadge: {
    fontSize: 10, padding: '2px 8px', borderRadius: 4,
    background: 'var(--accent-glow)', border: '1px solid var(--accent)',
    color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
  },
  liveCallBadge: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, padding: '2px 8px', borderRadius: 4,
    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
    color: '#ff7070', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#ff7070',
    animation: 'nexus-live-blink 1.2s ease-in-out infinite',
    display: 'inline-block',
  },
  desc: {
    fontSize: 12,
    color: 'var(--text-muted)',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  memberCount: { fontSize: 12, color: 'var(--text-muted)', marginRight: 8, whiteSpace: 'nowrap' },

  // Base button — same as existing
  btn: {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  btnActive: { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' },

  // Call button states
  callBtnIdle: {
    color: '#4ade80',
    background: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  callBtnHover: {
    background: 'rgba(34,197,94,0.22)',
    borderColor: 'rgba(34,197,94,0.6)',
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 12px rgba(34,197,94,0.2)',
  },
  callBtnActive: {
    color: '#ff8080',
    background: 'rgba(239,68,68,0.18)',
    borderColor: 'rgba(239,68,68,0.45)',
  },
  callBtnWithParticipants: {
    color: '#3b82f6',
    background: 'rgba(59, 130, 246, 0.18)',
    borderColor: 'rgba(59, 130, 246, 0.45)',
  },
  callPulseDot: {
    display: 'inline-block',
    width: 7, height: 7, borderRadius: '50%',
    background: '#ff7070',
    boxShadow: '0 0 6px #ff7070',
    animation: 'nexus-call-ping 1.6s ease-out infinite',
  },

  // Overflow
  overflowContainer: { position: 'relative' },
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 150,
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    zIndex: 100,
  },
  dropdownBtn: {
    padding: '8px 12px',
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  },
  dropdownBtnActive: {
    background: 'var(--bg-elevated)',
    color: 'var(--accent)',
  },

  // Call overlay
  callOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  callModal: {
    width: '100%',
    maxWidth: 1100,
    height: '90vh',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
  },
};