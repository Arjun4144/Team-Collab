import React, { useState, useRef, useCallback } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import { intentConfig, priorityConfig, getInitials } from '../../utils/helpers';

const INTENTS  = Object.keys(intentConfig);
const PRIORITIES = Object.keys(priorityConfig);

export default function MessageComposer({ threadParent = null, onSent }) {
  const { activeChannel, user, addMessage, users, replyingTo, setReplyingTo } = useStore();
  const [content, setContent]   = useState('');
  const [intent, setIntent]     = useState('discussion');
  const [priority, setPriority] = useState('normal');
  const [sending, setSending]   = useState(false);
  const [file, setFile]         = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Mention state
  const [mentionState, setMentionState] = useState({ show: false, query: '', startIndex: -1 });
  const [mentionIndex, setMentionIndex] = useState(0);

  const typingTimer = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit');
        return;
      }
      setFile(selectedFile);
    }
  };

  const emitTyping = useCallback(() => {
    if (!activeChannel) return;
    const s = getSocket();
    s?.emit('typing:start', { channelId: activeChannel._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      s?.emit('typing:stop', { channelId: activeChannel._id });
    }, 2000);
  }, [activeChannel]);

  // Compute mention suggestions
  const channelMembers = activeChannel?.members || [];
  const mentionSuggestions = mentionState.show
    ? channelMembers.filter(u => u.name.replace(/\s+/g, '').toLowerCase().includes(mentionState.query.toLowerCase()))
    : [];

  const handleTextChange = (e) => {
    const val = e.target.value;
    setContent(val);
    emitTyping();

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionState({ show: true, query: match[1], startIndex: match.index });
      setMentionIndex(0);
    } else {
      setMentionState({ show: false, query: '', startIndex: -1 });
    }
  };

  const insertMention = (targetUser) => {
    if (!targetUser) return;
    const before = content.slice(0, mentionState.startIndex);
    const formattedName = targetUser.name.replace(/\s+/g, '');
    const after = content.slice(mentionState.startIndex + mentionState.query.length + 1);
    
    const newContent = `${before}@${formattedName} ${after}`;
    setContent(newContent);
    setMentionState({ show: false, query: '', startIndex: -1 });
    
    // Focus back on textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (mentionState.show && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionState({ show: false, query: '', startIndex: -1 });
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(e);
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    if ((!content.trim() && !file) || !activeChannel) return;
    
    const tempId = 'temp_' + Date.now();
    const effectiveParent = threadParent || replyingTo;
    const tempMessage = {
      _id: tempId,
      channel: activeChannel,
      content: content.trim(),
      intentType: intent,
      priority,
      sender: user,
      createdAt: new Date().toISOString(),
      status: 'sending',
      attachments: file ? [{ name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file) }] : [],
      localFile: file,
      threadParent: effectiveParent ? (effectiveParent._id || effectiveParent) : null,
      replyCount: 0
    };
    
    useStore.getState().addMessage(tempMessage);
    
    setContent('');
    setFile(null);
    setUploadProgress(0);
    setMentionState({ show: false, query: '', startIndex: -1 });
    if (replyingTo) setReplyingTo(null);
    onSent?.();
    const s = getSocket();
    s?.emit('typing:stop', { channelId: activeChannel._id });

    // Let the store handle the API call and updates
    useStore.getState().performSend(tempMessage);
  };

  const cfg = intentConfig[intent];

  return (
    <form onSubmit={send} style={styles.form}>
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

      <div style={styles.intentIndicator}>
        <span style={{ color: intentColor[intent], fontSize: 13 }}>{cfg.icon} {cfg.label}</span>
        {intent === 'action'   && <span style={styles.hint}>→ Will auto-create a task</span>}
        {intent === 'decision' && <span style={styles.hint}>→ Will be logged to Decision Log</span>}
        {intent === 'announcement' && <span style={styles.hint}>→ All members will be notified</span>}
        {threadParent && <span style={styles.hint}>Replying in thread</span>}
      </div>

      {replyingTo && !threadParent && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px', background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent)',
          borderTopRightRadius: 8, borderTopLeftRadius: 8, marginBottom: 2, fontSize: 12
        }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--accent)', marginRight: 6 }}>Replying to {replyingTo.sender?.name}:</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {replyingTo.content ? (replyingTo.content.length > 60 ? replyingTo.content.substring(0,60)+'...' : replyingTo.content) : (replyingTo.attachments?.length > 0 ? '📎 Attachment' : '')}
            </span>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, marginLeft: 8 }}>✕</button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {mentionState.show && mentionSuggestions.length > 0 && (
          <ul style={styles.mentionList}>
            {mentionSuggestions.map((u, idx) => (
              <li 
                key={u._id} 
                style={{ ...styles.mentionItem, ...(idx === mentionIndex ? styles.mentionItemActive : {}) }}
                onClick={() => insertMention(u)}
                onMouseEnter={() => setMentionIndex(idx)}
              >
                <div style={styles.avatar}>{getInitials(u.name)}</div>
                <div>
                  <div style={styles.mentionName}>{u.name}</div>
                  <div style={styles.mentionRole}>{u.role}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        
        <div style={styles.inputRow}>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={styles.attachBtn} title="Attach file">📎</button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt" />
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {file && (
              <div style={styles.filePreviewContainer}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                <button type="button" onClick={() => setFile(null)} style={styles.removeFileBtn}>✕</button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              style={styles.textarea}
              placeholder={`Write a ${intent}… (type @ to mention members)`}
              value={content}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              rows={3}
            />
          </div>
          <button type="submit" disabled={(!content.trim() && !file) || sending} style={styles.sendBtn}>
            ↑
          </button>
        </div>
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
  hint2: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 },
  mentionList: {
    position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px', margin: 0, listStyle: 'none',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    zIndex: 50, maxHeight: 200, overflowY: 'auto', minWidth: 200
  },
  mentionItem: {
    padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
    cursor: 'pointer', transition: 'background 0.1s'
  },
  mentionItemActive: { background: 'var(--bg-active)' },
  avatar: {
    width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700
  },
  mentionName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
  mentionRole: { fontSize: 11, color: 'var(--text-muted)' },
  attachBtn: {
    width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, marginBottom: 4, transition: 'all 0.15s'
  },
  filePreviewContainer: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-elevated)',
    borderRadius: 8, border: '1px solid var(--border)', width: 'fit-content'
  },
  removeFileBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0
  }
};
