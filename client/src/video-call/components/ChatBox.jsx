/**
 * ChatBox — In-call real-time chat visible only to call participants.
 */
import React, { useState, useRef, useEffect } from 'react';

export default function ChatBox({ messages, onSend, currentUserId }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>💬</span>
        <span style={styles.headerText}>In-Call Chat</span>
      </div>

      <div style={styles.messageList} ref={listRef}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>No messages yet</div>
        ) : (
          messages.map(msg => {
            const isOwn = msg.userId === currentUserId;
            return (
              <div key={msg.id} style={{ ...styles.msg, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                {!isOwn && <span style={styles.msgName}>{msg.userName}</span>}
                <div style={{ ...styles.msgBubble, ...(isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther) }}>
                  {msg.text}
                </div>
                <span style={styles.msgTime}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} style={styles.inputRow}>
        <input
          style={styles.input}
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={500}
        />
        <button type="submit" style={styles.sendBtn} disabled={!text.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    width: 280,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: 14,
  },
  headerText: {
    color: '#e8edf5',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  emptyState: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    padding: 20,
    fontStyle: 'italic',
  },
  msg: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '85%',
  },
  msgName: {
    fontSize: 10,
    color: '#0ea5e9',
    fontWeight: 700,
    marginBottom: 2,
    paddingLeft: 2,
  },
  msgBubble: {
    padding: '6px 10px',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  msgBubbleOwn: {
    background: 'rgba(14,165,233,0.25)',
    color: '#e8edf5',
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    background: 'rgba(255,255,255,0.08)',
    color: '#e8edf5',
    borderBottomLeftRadius: 4,
  },
  msgTime: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
    paddingLeft: 2,
  },
  inputRow: {
    display: 'flex',
    gap: 6,
    padding: '8px 10px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    color: '#e8edf5',
    outline: 'none',
    fontFamily: 'inherit',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: '#0ea5e9',
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
};
