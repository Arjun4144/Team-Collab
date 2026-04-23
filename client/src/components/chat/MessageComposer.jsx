import React, { useState, useRef, useCallback } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import { intentConfig, priorityConfig } from '../../utils/helpers';

const INTENTS  = Object.keys(intentConfig);
const PRIORITIES = Object.keys(priorityConfig);

export default function MessageComposer({ threadParent = null, onSent }) {
  const { activeChannel, user, addMessage } = useStore();
  const [content, setContent]   = useState('');
  const [intent, setIntent]     = useState('discussion');
  const [priority, setPriority] = useState('normal');
  const [sending, setSending]   = useState(false);
  const typingTimer = useRef(null);

  const emitTyping = useCallback(() => {
    if (!activeChannel) return;
    const s = getSocket();
    s?.emit('typing:start', { channelId: activeChannel._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      s?.emit('typing:stop', { channelId: activeChannel._id });
    }, 2000);
  }, [activeChannel]);

  const send = async (e) => {
    e.preventDefault();
    if (!content.trim() || !activeChannel) return;
    setSending(true);
    try {
      const { data } = await api.post('/messages', {
        channel: activeChannel._id,
        content: content.trim(),
        intentType: intent,
        priority,
        threadParent: threadParent?._id || null
      });
      addMessage(data);
      const s = getSocket();
      s?.emit('message:send', data);
      setContent('');
      onSent?.();
      s?.emit('typing:stop', { channelId: activeChannel._id });
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const cfg = intentConfig[intent];

  return (
    <form onSubmit={send} style={styles.form}>
      {/* Intent + Priority selectors */}
      <div style={styles.toolbar}>
        <div style={styles.intentRow}>
          {INTENTS.map(i => (
            <button key={i} type="button" onClick={() => setIntent(i)}
              style={{ ...styles.intentBtn, ...(intent === i ? { background: `rgba(${intentBg[i]},0.15)`, borderColor: `rgba(${intentBg[i]},0.4)`, color: intentColor[i] } : {}) }}>
              {intentConfig[i].icon} {intentConfig[i].label}
            </button>
          ))}
        </div>
        <div style={styles.priorityRow}>
          {PRIORITIES.map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)}
              style={{ ...styles.priorityBtn, ...(priority === p ? styles.priorityActive : {}) }}>
              <span className={`priority-dot priority-${p}`} />
              {priorityConfig[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* Intent indicator */}
      <div style={styles.intentIndicator}>
        <span style={{ color: intentColor[intent], fontSize: 13 }}>{cfg.icon} {cfg.label}</span>
        {intent === 'action'   && <span style={styles.hint}>→ Will auto-create a task</span>}
        {intent === 'decision' && <span style={styles.hint}>→ Will be logged to Decision Log</span>}
        {intent === 'announcement' && <span style={styles.hint}>→ All members will be notified</span>}
        {threadParent && <span style={styles.hint}>Replying in thread</span>}
      </div>

      {/* Textarea */}
      <div style={styles.inputRow}>
        <textarea
          style={styles.textarea}
          placeholder={`Write a ${intent}…`}
          value={content}
          onChange={e => { setContent(e.target.value); emitTyping(); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); }
          }}
          rows={3}
        />
        <button type="submit" disabled={!content.trim() || sending} style={styles.sendBtn}>
          {sending ? '…' : '↑'}
        </button>
      </div>
      <div style={styles.hint2}>Enter to send · Shift+Enter for new line</div>
    </form>
  );
}

const intentBg    = { discussion:'99,102,241', announcement:'245,158,11', decision:'16,185,129', action:'249,115,22', fyi:'139,92,246' };
const intentColor = { discussion:'#818cf8', announcement:'#fbbf24', decision:'#34d399', action:'#fb923c', fyi:'#a78bfa' };

const styles = {
  form: {
    padding: '12px 16px 10px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-surface)', flexShrink: 0
  },
  toolbar: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  intentRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  intentBtn: {
    padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4
  },
  priorityRow: { display: 'flex', gap: 4, marginLeft: 'auto' },
  priorityBtn: {
    padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', background: 'none', border: '1px solid transparent',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
  },
  priorityActive: { border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
  intentIndicator: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
    fontSize: 12, fontFamily: 'var(--font-mono)'
  },
  hint: { color: 'var(--text-muted)', fontSize: 11 },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: {
    flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)',
    resize: 'none', lineHeight: 1.5, transition: 'border-color 0.15s',
    fontFamily: 'var(--font-body)'
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 10,
    background: 'var(--accent)', color: '#fff',
    border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700,
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s'
  },
  hint2: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }
};
