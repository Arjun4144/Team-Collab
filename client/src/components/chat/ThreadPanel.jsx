import React from 'react';
import useStore from '../../store/useStore';
import MessageBubble from './MessageBubble';
import { intentConfig, formatTime, getInitials } from '../../utils/helpers';

export default function ThreadPanel() {
  const { activeThread, setActiveThread, messages, activeChannel } = useStore();

  if (!activeThread || !activeChannel) return null;

  const channelId = activeChannel._id;
  const channelMessages = messages[channelId] || [];
  const threadId = activeThread._id;

  // Resolve the parent message live from the store so updates (urgent, etc.) reflect instantly
  const liveParent = channelMessages.find(m => m._id === threadId) || activeThread;

  // Derive replies from the global store — filter messages whose threadParent matches this thread
  const replies = channelMessages.filter(m => {
    const tp = m.threadParent;
    if (!tp) return false;
    const parentId = typeof tp === 'object' && tp !== null ? (tp._id || tp) : tp;
    return String(parentId) === String(threadId);
  });

  const intent = liveParent.intentType ? intentConfig[liveParent.intentType] : null;
  const replyCount = liveParent.replyCount || replies.length;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Thread</div>
          {intent && intent.icon && intent.label && (
            <span className={`intent-badge intent-${liveParent.intentType}`}>
              {intent.icon} {intent.label}
            </span>
          )}
        </div>
        <button onClick={() => setActiveThread(null)} style={styles.close}>✕</button>
      </div>

      {/* Parent message */}
      <div style={styles.parent}>
        <div style={styles.parentMeta}>
          <div style={styles.parentAvatar}>{getInitials(liveParent.sender?.name || 'Unknown')}</div>
          <span style={styles.parentName}>{liveParent.sender?.name || 'Unknown'}</span>
          <span style={styles.parentTime}>{liveParent.createdAt ? formatTime(liveParent.createdAt) : ''}</span>
        </div>
        <div style={{ ...styles.parentContent, ...(liveParent.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : {}) }}>
          {liveParent.content || 'Message'}
        </div>
      </div>

      <div style={styles.divider}>
        <span style={styles.replyCount}>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
      </div>

      <div style={styles.replies}>
        {replies.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            No replies yet
          </div>
        ) : (
          replies.map(r => (
            <MessageBubble key={r._id} message={r} />
          ))
        )}
      </div>

    </div>
  );
}

const styles = {
  panel: {
    width: 'var(--panel-width, 360px)', borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)',
    display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden'
  },
  header: {
    padding: '14px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0
  },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, fontFamily: 'var(--font-display)' },
  close: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 },
  parent: {
    padding: '12px 16px', background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)', flexShrink: 0
  },
  parentMeta: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  parentAvatar: {
    width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-hover)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--accent)'
  },
  parentName: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' },
  parentTime: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  parentContent: { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  divider: { padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  replyCount: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  replies: { flex: 1, overflowY: 'auto', padding: '8px 0' }
};
