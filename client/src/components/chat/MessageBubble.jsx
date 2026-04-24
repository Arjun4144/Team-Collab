import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { getInitials, formatTime, intentConfig } from '../../utils/helpers';

export default function MessageBubble({ message, onReply }) {
  const { user, updateMessage, setActiveThread, setReplyingTo, hideMessage, channels, deleteMessageForEveryone, messages } = useStore();
  const [showVerdict, setShowVerdict] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' });
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target) &&
        triggerRef.current && !triggerRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    if (showDropdown) {
      setShowDropdown(false);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = 200; // safe estimate
    const isAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    
    setDropdownPos({
      top: isAbove ? 'auto' : rect.bottom + 8,
      bottom: isAbove ? window.innerHeight - rect.top + 8 : 'auto',
      left: isOwn ? 'auto' : rect.left,
      right: isOwn ? window.innerWidth - rect.right : 'auto'
    });
    setShowDropdown(true);
  };

  const intent = intentConfig[message.intentType] || intentConfig.discussion;
  const isOwn = message.sender?._id === user?._id;
  const currentChannel = channels.find(c => c._id === (message.channel?._id || message.channel));
  const isAdmin = currentChannel?.admins.includes(user?._id);

  const parentMessage = message.threadParent 
    ? (typeof message.threadParent === 'object' 
        ? message.threadParent 
        : messages[currentChannel?._id]?.find(m => m._id === message.threadParent))
    : null;

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

        {parentMessage && (
          <div 
            onClick={() => {
              const el = document.getElementById(`msg-${parentMessage._id || parentMessage}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            style={{
              borderLeft: '3px solid var(--accent)',
              paddingLeft: '8px',
              marginBottom: '6px',
              cursor: 'pointer',
              opacity: 0.85
            }}
            title="Click to view original message"
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>
              {parentMessage.sender?.name || 'Unknown'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {parentMessage.content 
                ? (parentMessage.content.length > 50 ? parentMessage.content.substring(0, 50) + '...' : parentMessage.content) 
                : (parentMessage.attachments?.length > 0 ? '📎 Attachment' : '...')}
            </div>
          </div>
        )}

        <div style={styles.content}>
          {message.content ? message.content.split(/(@\w+)/g).map((part, i) => 
            part.startsWith('@') ? (
              <span key={i} style={styles.mention}>{part}</span>
            ) : part
          ) : null}
        </div>

        {message.verdict && (
          <div style={styles.verdictBox}>
            <span style={styles.verdictLabel}>Verdict</span>
            <span style={styles.verdictText}>{message.verdict}</span>
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div style={styles.attachments}>
            {message.attachments.map((att, i) => {
              const isImage = att.type.startsWith('image/');
              const actualUrl = att.url.startsWith('/uploads/') ? att.url : `/uploads/${att.url}`;
              const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
              const fileUrl = `${backendUrl}${actualUrl}`;
              return (
                <div key={i} style={styles.attachment}>
                  {isImage ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer">
                      <img src={fileUrl} alt={att.name} style={styles.imagePreview} />
                    </a>
                  ) : (
                    <div style={styles.fileCard}>
                      <span style={styles.fileIcon}>📄</span>
                      <div style={styles.fileInfo}>
                        <div style={styles.fileName}>{att.name}</div>
                        <div style={styles.fileSize}>{att.size ? (att.size / 1024 / 1024).toFixed(2) + ' MB' : ''}</div>
                      </div>
                      <a href={fileUrl} target="_blank" rel="noreferrer" style={styles.downloadBtn}>Download</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Actions row */}
        <div style={{ ...styles.actions, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
          {message.replyCount > 0 && (
            <button onClick={() => setActiveThread(message)} style={styles.threadBtn}>
              💬 {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
          
          <div>
            <button ref={triggerRef} onClick={toggleDropdown} style={styles.actionBtn} title="More actions">
              ⋮
            </button>
            
            {showDropdown && createPortal(
              <div ref={dropdownRef} style={{ ...styles.dropdownMenu, top: dropdownPos.top, bottom: dropdownPos.bottom, left: dropdownPos.left, right: dropdownPos.right }}>
                <button className="dropdown-item" onClick={() => { setReplyingTo(message); setShowDropdown(false); }} style={styles.dropdownItem}>Reply</button>
                
                {!message.isResolved && message.intentType === 'discussion' && !isOwn && (
                  <button className="dropdown-item" onClick={() => { setShowVerdict(v => !v); setShowDropdown(false); }} style={styles.dropdownItem}>Resolve</button>
                )}
                {!message.isResolved && ['decision','action'].includes(message.intentType) && (
                  <button className="dropdown-item" onClick={() => { setShowVerdict(v => !v); setShowDropdown(false); }} style={styles.dropdownItem}>Close</button>
                )}
                
                <button className="dropdown-item"
                  onClick={() => { hideMessage(message.channel?._id || message.channel, message._id); setShowDropdown(false); }} 
                  style={styles.dropdownItem}
                >Delete for me</button>
                
                {isAdmin && !message.isTemp && (
                  <button className="dropdown-item"
                    onClick={() => { deleteMessageForEveryone(message.channel?._id || message.channel, message._id); setShowDropdown(false); }} 
                    style={{ ...styles.dropdownItem, color: '#ef4444' }}
                  >Delete for everyone</button>
                )}
              </div>,
              document.body
            )}
          </div>
        </div>
        
        {message.status === 'sending' && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {message.localFile ? `Uploading... ${message.uploadProgress || 0}%` : 'Sending...'}
            </div>
            {message.localFile && (
              <div style={{ width: '100%', height: 4, background: 'var(--bg-void)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${message.uploadProgress || 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.1s linear' }} />
              </div>
            )}
          </div>
        )}
        {message.status === 'failed' && (
          <div style={{ 
            fontSize: 11, color: '#ef4444', marginTop: 8, padding: '6px 10px', 
            background: 'rgba(239, 68, 68, 0.1)', borderRadius: 6, 
            display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between'
          }}>
            <span style={{ fontWeight: 600 }}>Failed to send</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => useStore.getState().performSend(message)} style={styles.retryBtn}>Retry</button>
              <button onClick={() => useStore.getState().removeMessage(message.channel?._id || message.channel, message._id)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        )}

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
  dropdownMenu: {
    position: 'fixed',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    zIndex: 9999, display: 'flex', flexDirection: 'column', minWidth: 150
  },
  dropdownItem: {
    padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none',
    color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', borderRadius: 4,
    width: '100%', transition: 'background 0.1s'
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
  },
  attachments: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  attachment: { overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border)' },
  imagePreview: { maxWidth: '100%', maxHeight: 250, display: 'block', objectFit: 'contain', background: 'var(--bg-void)' },
  fileCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-base)' },
  fileIcon: { fontSize: 24 },
  fileInfo: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileSize: { fontSize: 11, color: 'var(--text-muted)' },
  downloadBtn: { fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, padding: '4px 8px', background: 'var(--accent-glow)', borderRadius: 4 },
  retryBtn: { background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }
};
