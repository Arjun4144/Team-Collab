import React, { useEffect, useRef, useState } from 'react';
import useStore from '../../store/useStore';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import api from '../../utils/api';

// localStorage helpers for persistent lastSeen
const getLastSeen = (chId) => {
  try { return (JSON.parse(localStorage.getItem('nexus_lastSeen') || '{}'))[chId] || 0; } catch { return 0; }
};
const setLastSeen = (chId) => {
  try {
    const map = JSON.parse(localStorage.getItem('nexus_lastSeen') || '{}');
    map[chId] = Date.now();
    localStorage.setItem('nexus_lastSeen', JSON.stringify(map));
  } catch {}
};

export default function ChatArea() {
  const { activeChannel, messages, typing, user } = useStore();
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);

  // AI Summary
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const chMsgs = activeChannel ? (messages[activeChannel._id] || []) : [];
  const typingUsers = activeChannel ? Object.values(typing[activeChannel._id] || {}) : [];

  // Unread count (persistent via localStorage)
  const lastSeen = activeChannel ? getLastSeen(activeChannel._id) : 0;
  const unreadCount = (user?._id && activeChannel) ? chMsgs.filter(m =>
    m.sender?._id !== user._id && !m._id?.startsWith('temp_') &&
    new Date(m.createdAt).getTime() > lastSeen
  ).length : 0;

  // CTA visible if channel has > 5 messages
  const showCta = chMsgs.length > 5 && !summary && !loading;

  // Reset on channel switch
  useEffect(() => {
    setSummary(null); setError(null); setLoading(false);
  }, [activeChannel?._id]);

  const handleSummarize = async () => {
    if (!activeChannel || loading) return;
    setLoading(true); setError(null);
    try {
      const { data } = await api.post(`/messages/channel/${activeChannel._id}/summarize`);
      setSummary(data.summary);
      setLastSeen(activeChannel._id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  const dismiss = () => {
    setSummary(null);
    setLastSeen(activeChannel?._id);
  };

  // Scroll management
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
    if (atBottom) setShowNewMsg(false);
  };

  useEffect(() => {
    if (isAtBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    else setShowNewMsg(true);
  }, [chMsgs.length]);

  const scrollDown = () => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowNewMsg(false); };

  if (!activeChannel) {
    return (
      <div style={s.empty}>
        <div style={s.emptyIcon}>N</div>
        <h2 style={s.emptyTitle}>Welcome to Nexus</h2>
        <p style={s.emptySub}>Select a channel to start communicating with intent.</p>
        <div style={s.emptyHints}>
          {[
            { icon: '💬', t: 'Discussion', d: 'Open-ended conversations' },
            { icon: '✅', t: 'Decision',   d: 'Logged permanently' },
            { icon: '⚡', t: 'Action',     d: 'Auto-creates tasks' },
            { icon: '📢', t: 'Announcement', d: 'Notifies all members' },
          ].map(({ icon, t, d }) => (
            <div key={t} style={s.hintCard}>
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
    <div style={s.area}>
      {typingUsers.length > 0 && (
        <div style={s.typingTop}><span style={s.typingText}>{typingText}</span></div>
      )}

      {/* Summary result — top card */}
      {summary && (
        <div style={s.summaryCard}>
          <div style={s.summaryHead}>
            <span style={s.summaryLabel}>✦ AI Summary</span>
            <button onClick={dismiss} style={s.closeBtn}>✕</button>
          </div>
          <div style={s.summaryBody}>{summary}</div>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div style={s.errorBar}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={s.closeBtn}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div style={s.messages} ref={containerRef} onScroll={handleScroll}>
        {chMsgs.length === 0 && (
          <div style={s.noMessages}>No messages yet in <strong>#{activeChannel.name}</strong>. Start the conversation.</div>
        )}
        {chMsgs.map(msg => <MessageBubble key={msg._id} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* New messages btn */}
      {showNewMsg && (
        <button onClick={scrollDown} style={s.newMsgBtn}>
          <span style={{ fontSize: 14 }}>↓</span> New messages
        </button>
      )}

      {/* AI Summary CTA — fixed floating pill */}
      {showCta && (
        <button onClick={handleSummarize} disabled={loading} style={s.ctaPill}>
          <span style={{ fontSize: 14 }}>✦</span>
          {unreadCount > 0 ? `Summarize ${unreadCount} unread` : 'Summarize conversation'}
        </button>
      )}

      {/* Loading pill */}
      {loading && (
        <div style={s.loadingPill}>
          <span style={s.spinner} />
          Summarizing…
        </div>
      )}

      <MessageComposer />
    </div>
  );
}

const s = {
  area: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-surface)', position: 'relative' },
  messages: { flex: 1, overflowY: 'auto', padding: '16px 0', scrollBehavior: 'smooth' },
  // Empty state
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', padding: 40, gap: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 16, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, marginBottom: 8 },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' },
  emptySub: { color: 'var(--text-secondary)', fontSize: 15 },
  emptyHints: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, maxWidth: 480, width: '100%' },
  hintCard: { display: 'flex', gap: 12, padding: '14px 16px', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)' },
  noMessages: { textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: 14 },
  // Typing
  typingTop: { position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(var(--bg-surface-rgb), 0.85)', backdropFilter: 'blur(4px)', padding: '6px 20px', zIndex: 10, borderBottom: '1px solid var(--border)', animation: 'slideDown 0.2s ease-out' },
  typingText: { fontSize: 12, color: 'var(--accent)', fontWeight: 600 },
  // New messages
  newMsgBtn: {
    position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
    borderRadius: 24, padding: '6px 16px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 20, animation: 'slideUp 0.2s ease', display: 'flex', alignItems: 'center', gap: 6
  },
  // ── AI Summary CTA pill ──
  ctaPill: {
    position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 22, padding: '7px 18px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    zIndex: 100, animation: 'slideUp 0.25s ease',
    display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
    transition: 'all 0.15s', letterSpacing: '-0.01em'
  },
  loadingPill: {
    position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 22, padding: '7px 18px', fontSize: 13, fontWeight: 500,
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)', zIndex: 100,
    display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap'
  },
  spinner: {
    width: 14, height: 14, border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)', borderRadius: '50%',
    animation: 'spin 0.6s linear infinite', display: 'block', flexShrink: 0
  },
  // ── Summary card ──
  summaryCard: {
    margin: '0 16px 0', padding: '14px 16px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 12, flexShrink: 0,
    animation: 'slideDown 0.25s ease-out'
  },
  summaryHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8
  },
  summaryLabel: {
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.6px'
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1,
    borderRadius: 4, transition: 'color 0.15s'
  },
  summaryBody: {
    fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.75,
    whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto'
  },
  // Error
  errorBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    margin: '0 16px', padding: '8px 14px', background: 'rgba(239,68,68,0.06)',
    border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, flexShrink: 0,
    fontSize: 13, color: '#ef4444', fontWeight: 500
  }
};
