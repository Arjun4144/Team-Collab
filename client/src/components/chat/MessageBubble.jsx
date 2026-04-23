import React, { useState } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { getInitials, formatTime, intentConfig } from '../../utils/helpers';

export default function MessageBubble({ message, onReply }) {
  const { user, updateMessage, setActiveThread } = useStore();
  const [showVerdict, setShowVerdict] = useState(false);
  const [verdict, setVerdict] = useState('');

  const intent = intentConfig[message.intentType] || intentConfig.discussion;
  const isOwn = message.sender?._id === user?._id;

  const resolve = async () => {
    try {
      const socket = (await import('../../utils/socket')).getSocket();
      const { data } = await api.patch(`/messages/${message._id}/resolve`, { verdict });
      updateMessage(data);
      socket?.emit('message:resolve', { ...data, channel: message.channel });
      setShowVerdict(false);
    } catch {}
  };

  return (
    <div id={`msg-${message._id}`} style={{
      ...styles.row,
      justifyContent: isOwn ? 'flex-end' : 'flex-start',
      animation: 'fadeIn 0.2s ease both'
    }} className="animate-fade">
      {/* Avatar — only for others */}
      {!isOwn && (
        <div style={styles.avatarWrap}>
          <div style={styles.avatar}>{getInitials(message.sender?.name)}</div>
        </div>
      )}

      {/* Bubble */}
      <div style={{
        ...styles.bubble,
        ...(isOwn ? styles.bubbleOwn : styles.bubbleOther),
        borderTopRightRadius: isOwn ? 4 : 16,
        borderTopLeftRadius: isOwn ? 16 : 4,
      }}>
        {/* Sender name — only for others */}
        {!isOwn && (
          <div style={styles.senderName}>{message.sender?.name || 'Unknown'}</div>
        )}

        <div style={styles.meta}>
          <span className={`intent-badge intent-${message.intentType}`}>
            {intent.icon} {intent.label}
          </span>
          {message.isResolved && <span style={styles.resolved}>✓ Resolved</span>}
        </div>

        <div style={styles.content}>
          {message.content.split(/(@\w+)/g).map((part, i) => 
            part.startsWith('@') ? (
              <span key={i} style={styles.mention}>{part}</span>
            ) : part
          )}
        </div>

        {message.verdict && (
          <div style={styles.verdictBox}>
            <span style={styles.verdictLabel}>Verdict</span>
            <span style={styles.verdictText}>{message.verdict}</span>
          </div>
        )}

        {/* Actions row */}
        <div style={{ ...styles.actions, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
          {message.replyCount > 0 && (
            <button onClick={() => setActiveThread(message)} style={styles.threadBtn}>
              💬 {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
          <button onClick={() => setActiveThread(message)} style={styles.actionBtn}>Reply</button>
          {!message.isResolved && message.intentType === 'discussion' && !isOwn && (
            <button onClick={() => setShowVerdict(v => !v)} style={styles.actionBtn}>Resolve</button>
          )}
          {!message.isResolved && ['decision','action'].includes(message.intentType) && (
            <button onClick={() => setShowVerdict(v => !v)} style={styles.actionBtn}>Close</button>
          )}
        </div>

        {showVerdict && (
          <div style={styles.verdictForm}>
            <input style={styles.verdictInput} placeholder="Add verdict or summary…"
              value={verdict} onChange={e => setVerdict(e.target.value)} />
            <button onClick={resolve} style={styles.resolveBtn}>Mark resolved</button>
          </div>
        )}

        {/* Timestamp — bottom-right like WhatsApp */}
        <div style={{ ...styles.timeRow, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
          <span style={styles.time}>{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex', gap: 8, padding: '3px 20px',
    transition: 'background 0.1s', margin: '0 4px',
    alignItems: 'flex-end'
  },
  avatarWrap: { flexShrink: 0, paddingBottom: 4 },
  avatar: {
    width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)'
  },
  bubble: {
    maxWidth: '70%', minWidth: 120, padding: '8px 12px',
    borderRadius: 16, position: 'relative'
  },
  bubbleOwn: {
    background: 'rgba(14,165,233,0.12)',
    border: '1px solid rgba(14,165,233,0.22)',
  },
  bubbleOther: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
  },
  senderName: {
    fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 2
  },
  meta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  time: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  timeRow: { display: 'flex', marginTop: 4 },
  resolved: {
    fontSize: 10, padding: '2px 6px', borderRadius: 10,
    background: 'rgba(16,185,129,0.1)', color: '#34d399',
    border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600
  },
  content: {
    fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6,
    wordBreak: 'break-word', whiteSpace: 'pre-wrap'
  },
  mention: {
    color: 'var(--accent)', fontWeight: 600, background: 'var(--accent-glow)',
    padding: '0 4px', borderRadius: 4, display: 'inline-block'
  },
  verdictBox: {
    marginTop: 8, padding: '8px 12px',
    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 6, display: 'flex', gap: 8, alignItems: 'flex-start'
  },
  verdictLabel: { fontSize: 11, fontWeight: 700, color: '#34d399', flexShrink: 0, marginTop: 1 },
  verdictText: { fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  actionBtn: {
    padding: '3px 10px', borderRadius: 5, fontSize: 11, color: 'var(--text-muted)',
    background: 'none', border: 'none', cursor: 'pointer',
    transition: 'color 0.1s'
  },
  threadBtn: {
    padding: '3px 10px', borderRadius: 5, fontSize: 11, color: 'var(--accent)',
    background: 'var(--accent-glow)', border: 'none', cursor: 'pointer', fontWeight: 500
  },
  verdictForm: { display: 'flex', gap: 8, marginTop: 8 },
  verdictInput: {
    flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '6px 12px', fontSize: 13, color: 'var(--text-primary)'
  },
  resolveBtn: {
    padding: '6px 14px', background: 'rgba(16,185,129,0.15)', color: '#34d399',
    border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, fontSize: 12,
    fontWeight: 600, cursor: 'pointer'
  }
};
