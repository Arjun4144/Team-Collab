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

const EMPTY_MESSAGES = [];

export default function ChatArea() {
  const activeChannel = useStore(s => s.activeChannel);
  const user = useStore(s => s.user);
  const typing = useStore(s => s.typing);
  const summaries = useStore(s => s.summaries);
  const setChannelSummary = useStore(s => s.setChannelSummary);
  const hideChannelSummary = useStore(s => s.hideChannelSummary);

  // Stable selector: read activeChannel._id from INSIDE the store, not from closure
  const activeChannelId = activeChannel?._id || null;
  const selectChannelMessages = React.useCallback(
    (s) => {
      const chId = s.activeChannel?._id;
      return chId ? (s.messages[chId] || EMPTY_MESSAGES) : EMPTY_MESSAGES;
    }, []
  );
  const channelMessages = useStore(selectChannelMessages);

  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  // Summary state from store
  const activeSummary = activeChannelId ? summaries[activeChannelId] : null;
  const showSummaryCard = activeSummary && !activeSummary.hidden;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const chMsgs = channelMessages;
  const typingUsers = activeChannelId ? Object.values(typing[activeChannelId] || {}) : [];

  // Unread count (persistent via localStorage)
  const lastSeen = activeChannelId ? getLastSeen(activeChannelId) : 0;
  const unreadCount = (user?._id && activeChannelId) ? chMsgs.filter(m =>
    m.sender?._id !== user._id && !m._id?.startsWith('temp_') &&
    new Date(m.createdAt).getTime() > lastSeen
  ).length : 0;

  const [summaryDismissed, setSummaryDismissed] = useState(false);

  // Reset dismissed state ONLY when unread count goes from 0 to >0
  const prevUnreadRef = useRef(0);
  useEffect(() => {
    if (unreadCount > 0 && prevUnreadRef.current === 0) {
      setSummaryDismissed(false);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Reset dismissed state when a NEW summary arrives (compare text, not object ref)
  const summaryText = activeSummary?.text || null;
  const prevSummaryTextRef = useRef(null);
  useEffect(() => {
    if (summaryText && summaryText !== prevSummaryTextRef.current) {
      setSummaryDismissed(false);
    }
    prevSummaryTextRef.current = summaryText;
  }, [summaryText]);

  // CTA visible ONLY if unread > 0, no summary, and not dismissed
  const showCta = unreadCount > 0 && !activeSummary && !loading && !summaryDismissed;

  // Reset on channel switch
  useEffect(() => {
    setError(null); setLoading(false);
    setSummaryDismissed(false);
    setSearchQuery('');
    setDebouncedSearch('');
    setShowSearch(false);
  }, [activeChannelId]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search filter — depend on stable primitive (length), not array reference
  const chMsgsLen = chMsgs.length;
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const q = debouncedSearch.toLowerCase();
    const currentMsgs = useStore.getState().messages[useStore.getState().activeChannel?._id] || [];
    const results = currentMsgs.filter(m => (m.content || '').toLowerCase().includes(q) || m.sender?.name?.toLowerCase().includes(q));
    setSearchResults(results);
  }, [debouncedSearch, chMsgsLen]);

  const handleResultClick = (msgId) => {
    setSearchQuery('');
    setDebouncedSearch('');
    setShowSearch(false);
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background 0.3s ease';
        el.style.background = 'var(--bg-active)';
        setTimeout(() => { el.style.background = ''; }, 2000);
      }
    }, 100);
  };

  const highlightText = (text, query) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? <mark key={i} style={{background: 'var(--accent)', color: '#fff', padding: '0 2px', borderRadius: 4}}>{part}</mark> : part
    );
  };

  const dismissCta = (e) => {
    e.stopPropagation();
    setSummaryDismissed(true);
  };

  // Auto-hide summary for active user
  const summaryHidden = activeSummary?.hidden;
  const summaryActiveUser = activeSummary?.activeUser;
  useEffect(() => {
    if (summaryText && !summaryHidden && summaryActiveUser && activeChannelId) {
      const timer = setTimeout(() => {
        useStore.getState().hideChannelSummary(activeChannelId);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [summaryText, summaryHidden, summaryActiveUser, activeChannelId]);

  const handleSummarize = async () => {
    if (!activeChannelId || loading) return;
    setLoading(true); setError(null);
    try {
      const { data } = await api.post(`/messages/channel/${activeChannelId}/summarize`);
      useStore.getState().setChannelSummary(activeChannelId, data.summary, false);
      setLastSeen(activeChannelId);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  const dismiss = () => {
    if (activeChannelId) hideChannelSummary(activeChannelId);
    setLastSeen(activeChannelId);
  };

  const reopenSummary = () => {
    if (activeChannelId && activeSummary) {
      setChannelSummary(activeChannelId, activeSummary.text, false);
    }
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
      {/* Search Bar */}
      <div style={s.searchContainer}>
        <div style={{ position: 'relative' }}>
          <input
            style={s.searchInput}
            placeholder="Search messages..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
          />
          {searchQuery && (
             <button onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }} style={s.searchClear}>✕</button>
          )}
        </div>
        {showSearch && debouncedSearch && (
          <div style={s.searchDropdown}>
            {searchResults.length === 0 ? (
              <div style={s.searchEmpty}>No messages found.</div>
            ) : (
              searchResults.map(msg => (
                <div key={msg._id} style={s.searchResultItem} onMouseDown={(e) => { e.preventDefault(); handleResultClick(msg._id); }}>
                  <div style={s.searchResultMeta}>{msg.sender?.name || 'Unknown'} <span style={{color: 'var(--text-muted)'}}>{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
                  <div style={s.searchResultText}>
                    {highlightText(msg.content || 'Attachment/Media', debouncedSearch)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {typingUsers.length > 0 && (
        <div style={s.typingTop}><span style={s.typingText}>{typingText}</span></div>
      )}

      {/* Summary result — top card */}
      {showSummaryCard && (
        <div style={s.summaryCard}>
          <div style={s.summaryHead}>
            <span style={s.summaryLabel}>✦ Summary</span>
            <button onClick={dismiss} style={s.closeBtn}>✕</button>
          </div>
          <div style={s.summaryBody}>{activeSummary.text}</div>
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

      {/* Summary CTA — fixed floating pill */}
      {showCta && (
        <div style={s.ctaContainer}>
          <button onClick={handleSummarize} disabled={loading} style={s.ctaPillInner}>
            <span style={{ fontSize: 14 }}>✦</span>
            Summarize {unreadCount} unread
          </button>
          <button onClick={dismissCta} style={s.ctaDismissBtn} title="Dismiss">✕</button>
        </div>
      )}

      {/* Reopen Summary CTA */}
      {activeSummary && activeSummary.hidden && !loading && !summaryDismissed && (
        <div style={s.ctaContainer}>
          <button onClick={reopenSummary} style={s.ctaPillInner}>
            <span style={{ fontSize: 14 }}>⚡</span> View Summary
          </button>
          <button onClick={dismissCta} style={s.ctaDismissBtn} title="Dismiss">✕</button>
        </div>
      )}

      {/* Loading pill */}
      {loading && (
        <div style={s.loadingPill}>
          <span style={s.spinner} />
          Summarizing…
        </div>
      )}

      <MessageComposer onSummarize={handleSummarize} />
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
  
  // Search
  searchContainer: { padding: '8px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', zIndex: 30 },
  searchInput: { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 30px 6px 12px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' },
  searchClear: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 },
  searchDropdown: { position: 'absolute', top: 46, left: 16, right: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', maxHeight: 300, overflowY: 'auto', zIndex: 100 },
  searchEmpty: { padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' },
  searchResultItem: { padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' },
  searchResultMeta: { fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' },
  searchResultText: { fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' },

  // Typing
  typingTop: { position: 'absolute', top: 50, left: 0, right: 0, background: 'rgba(var(--bg-surface-rgb), 0.85)', backdropFilter: 'blur(4px)', padding: '6px 20px', zIndex: 10, borderBottom: '1px solid var(--border)', animation: 'slideDown 0.2s ease-out' },
  typingText: { fontSize: 12, color: 'var(--accent)', fontWeight: 600 },
  // New messages
  newMsgBtn: {
    position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
    borderRadius: 24, padding: '6px 16px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 20, animation: 'slideUp 0.2s ease', display: 'flex', alignItems: 'center', gap: 6
  },
  // ── Summary CTA pill ──
  ctaContainer: {
    position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 24, display: 'flex', alignItems: 'center', padding: '6px 8px 6px 16px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100, animation: 'slideUp 0.25s ease',
    transition: 'all 0.2s', gap: 8
  },
  ctaPillInner: {
    background: 'none', border: 'none', color: 'var(--text-primary)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    padding: '2px 0', whiteSpace: 'nowrap'
  },
  ctaDismissBtn: {
    background: 'rgba(150,150,150,0.15)', border: 'none', color: 'var(--text-secondary)',
    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 10, transition: 'all 0.15s', marginLeft: 2
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
