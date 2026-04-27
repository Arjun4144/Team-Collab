import React, { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import CallButton from '../../video-call/components/CallButton';

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

export default function ChannelHeader() {
  const { activeChannel, activeWorkspace, setRightPanel, rightPanel, users, user, tasks } = useStore();

  const isWsOwner = (activeWorkspace?.createdBy?._id || activeWorkspace?.createdBy)?.toString() === user?._id?.toString();
  const isWsAdmin = activeWorkspace?.admins?.some(a => (typeof a === 'object' ? a._id : a)?.toString() === user?._id?.toString());
  const isChAdmin = activeChannel?.admins?.some(a => (typeof a === 'object' ? a._id : a)?.toString() === user?._id?.toString());
  const myRole = isWsOwner ? 'Owner' : ((isWsAdmin || isChAdmin) ? 'Admin' : 'Member');
  const width = useWindowWidth();
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef(null);

  useOnClickOutside(overflowRef, () => setShowOverflow(false));

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
    { id: 'tasks', label: `⚡ Tasks ${unseenTasks > 0 ? `(${unseenTasks})` : ''}` },
    { id: 'decisions', label: '✅ Decisions' },
    { id: 'members', label: '👥 Members' }
  ];

  let visibleActions = ALL_ACTIONS;
  let overflowActions = [];

  if (width < 900) {
    visibleActions = [ALL_ACTIONS[0]]; // Tasks
    overflowActions = [ALL_ACTIONS[1], ALL_ACTIONS[2]]; // Decisions, Members
  }
  if (width < 700) {
    visibleActions = []; // Only CallButton
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
    <header style={styles.header}>
      <div style={styles.left}>
        <span style={styles.hash}>#</span>
        <div style={styles.titleStack}>
          <div style={styles.nameRow}>
            <h1 style={styles.name}>{activeChannel.name}</h1>
            <span style={styles.roleBadge}>{myRole}</span>
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
        
        <CallButton channelId={activeChannel._id} />

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
    gap: 20
  },
  left: { 
    display: 'flex', 
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0
  },
  titleStack: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minWidth: 0,
    flex: 1,
    gap: 1
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0
  },
  right: { 
    display: 'flex', 
    alignItems: 'center', 
    gap: 8, 
    flexShrink: 0 
  },
  hash: { fontSize: 18, color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 },
  name: { 
    fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', 
    fontFamily: 'var(--font-display)', margin: 0, lineHeight: 1.4,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  roleBadge: {
    fontSize: 10, padding: '2px 8px', borderRadius: 4, 
    background: 'var(--accent-glow)', border: '1px solid var(--accent)', 
    color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', 
    letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0
  },
  desc: { 
    fontSize: 12, 
    color: 'var(--text-muted)', 
    margin: 0,
    overflow: 'hidden', 
    textOverflow: 'ellipsis', 
    whiteSpace: 'nowrap',
    lineHeight: 1.3
  },
  memberCount: { fontSize: 12, color: 'var(--text-muted)', marginRight: 8, whiteSpace: 'nowrap' },
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
    whiteSpace: 'nowrap'
  },
  btnActive: { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' },
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
    zIndex: 100
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
    whiteSpace: 'nowrap'
  },
  dropdownBtnActive: {
    background: 'var(--bg-elevated)',
    color: 'var(--accent)'
  }
};
