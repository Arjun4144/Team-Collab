import React, { useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

export default function ChatArea() {
  const { activeChannel, messages, typing } = useStore();
  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [showNewMessageBtn, setShowNewMessageBtn] = React.useState(false);

  const channelMessages = activeChannel ? (messages[activeChannel._id] || []) : [];
  const typingUsers = activeChannel ? Object.values(typing[activeChannel._id] || {}) : [];

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setShowNewMessageBtn(false);
    }
  };

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setShowNewMessageBtn(true);
    }
  }, [channelMessages.length]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowNewMessageBtn(false);
  };

  if (!activeChannel) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>N</div>
        <h2 style={styles.emptyTitle}>Welcome to Nexus</h2>
        <p style={styles.emptySub}>Select a channel to start communicating with intent.</p>
        <div style={styles.emptyHints}>
          {[
            { icon: '💬', t: 'Discussion', d: 'Open-ended conversations' },
            { icon: '✅', t: 'Decision',   d: 'Logged permanently' },
            { icon: '⚡', t: 'Action',     d: 'Auto-creates tasks' },
            { icon: '📢', t: 'Announcement', d: 'Notifies all members' },
          ].map(({ icon, t, d }) => (
            <div key={t} style={styles.hintCard}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div><div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  let typingText = '';
  if (typingUsers.length === 1) typingText = `${typingUsers[0]} is typing…`;
  else if (typingUsers.length >= 2) typingText = `${typingUsers.length} people are typing…`;

  return (
    <div style={styles.area}>
      {/* Typing indicator at top */}
      {typingUsers.length > 0 && (
        <div style={styles.typingTop}>
          <span style={styles.typingText}>{typingText}</span>
        </div>
      )}

      <div style={styles.messages} ref={messagesContainerRef} onScroll={handleScroll}>
        {channelMessages.length === 0 && (
          <div style={styles.noMessages}>
            No messages yet in <strong>#{activeChannel.name}</strong>. Start the conversation.
          </div>
        )}
        {channelMessages.map(msg => (
          <MessageBubble key={msg._id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {showNewMessageBtn && (
        <button onClick={scrollToBottom} style={styles.newMessageBtn}>
          <span style={{ fontSize: 14 }}>↓</span> New messages
        </button>
      )}

      <MessageComposer />
    </div>
  );
}

const styles = {
  area: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface)', position: 'relative' },
  messages: { flex: 1, overflowY: 'auto', padding: '16px 0', scrollBehavior: 'smooth' },
  empty: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', background: 'var(--bg-surface)', padding: 40, gap: 16
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 16, background: 'var(--accent)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, marginBottom: 8
  },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' },
  emptySub: { color: 'var(--text-secondary)', fontSize: 15 },
  emptyHints: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, maxWidth: 480, width: '100%' },
  hintCard: {
    display: 'flex', gap: 12, padding: '14px 16px', alignItems: 'center',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text-primary)'
  },
  noMessages: { textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: 14 },
  typingTop: { 
    position: 'absolute', top: 0, left: 0, right: 0, 
    background: 'rgba(var(--bg-surface-rgb), 0.85)', backdropFilter: 'blur(4px)',
    padding: '6px 20px', zIndex: 10, borderBottom: '1px solid var(--border)',
    animation: 'slideDown 0.2s ease-out'
  },
  typingText: { fontSize: 12, color: 'var(--accent)', fontWeight: 600 },
  newMessageBtn: {
    position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', 
    borderRadius: '24px', padding: '6px 16px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 20, animation: 'slideUp 0.2s ease',
    display: 'flex', alignItems: 'center', gap: 6
  }
};
