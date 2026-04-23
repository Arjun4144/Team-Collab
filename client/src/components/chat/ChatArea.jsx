import React, { useEffect, useRef } from 'react';
import useStore from '../../store/useStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

export default function ChatArea() {
  const { activeChannel, messages, typing } = useStore();
  const bottomRef = useRef(null);

  const channelMessages = activeChannel ? (messages[activeChannel._id] || []) : [];
  const typingUsers = activeChannel ? Object.values(typing[activeChannel._id] || {}) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length]);

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

  return (
    <div style={styles.area}>
      <div style={styles.messages}>
        {channelMessages.length === 0 && (
          <div style={styles.noMessages}>
            No messages yet in <strong>#{activeChannel.name}</strong>. Start the conversation.
          </div>
        )}
        {channelMessages.map(msg => (
          <MessageBubble key={msg._id} message={msg} />
        ))}
        {typingUsers.length > 0 && (
          <div style={styles.typing}>
            <span style={styles.typingDots}><span /><span /><span /></span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <MessageComposer />
    </div>
  );
}

const styles = {
  area: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface)' },
  messages: { flex: 1, overflowY: 'auto', padding: '16px 0' },
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
  typing: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 20px' },
  typingDots: {
    display: 'flex', gap: 3, alignItems: 'center',
  }
};
