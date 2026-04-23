import React, { useEffect, useState } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import { intentConfig, formatTime, getInitials } from '../../utils/helpers';

export default function ThreadPanel() {
  const { activeThread, setActiveThread } = useStore();
  const [replies, setReplies] = useState([]);

  useEffect(() => {
    if (!activeThread) return;
    api.get(`/messages/${activeThread._id}/thread`)
      .then(r => setReplies(r.data))
      .catch(() => {});
  }, [activeThread?._id]);

  if (!activeThread) return null;

  const intent = intentConfig[activeThread.intentType] || intentConfig.discussion;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Thread</div>
          <span className={`intent-badge intent-${activeThread.intentType}`}>
            {intent.icon} {intent.label}
          </span>
        </div>
        <button onClick={() => setActiveThread(null)} style={styles.close}>✕</button>
      </div>

      {/* Parent message */}
      <div style={styles.parent}>
        <div style={styles.parentMeta}>
          <div style={styles.parentAvatar}>{getInitials(activeThread.sender?.name)}</div>
          <span style={styles.parentName}>{activeThread.sender?.name}</span>
          <span style={styles.parentTime}>{formatTime(activeThread.createdAt)}</span>
        </div>
        <div style={styles.parentContent}>{activeThread.content}</div>
      </div>

      <div style={styles.divider}>
        <span style={styles.replyCount}>{activeThread.replyCount} {activeThread.replyCount === 1 ? 'reply' : 'replies'}</span>
      </div>

      <div style={styles.replies}>
        {replies.map(r => (
          <MessageBubble key={r._id} message={r} />
        ))}
      </div>

      <div style={styles.composerWrap}>
        <MessageComposer threadParent={activeThread} onSent={() => {
          api.get(`/messages/${activeThread._id}/thread`).then(r => setReplies(r.data));
        }} />
      </div>
    </div>
  );
}

const styles = {
  panel: {
    width: 360, borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)',
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
  replies: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  composerWrap: { borderTop: '1px solid var(--border)', flexShrink: 0 }
};
