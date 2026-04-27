import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { getInitials, formatTime, intentConfig } from '../../utils/helpers';
import Avatar from '../layout/Avatar';
import UserProfileModal from '../layout/UserProfileModal';

// Global: only one audio plays at a time
let globalPlayingAudio = null;
let globalPlayingSetter = null;

function AudioPlayer({ audioUrl, duration: serverDuration, isOwn }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(serverDuration || 0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setTotalDuration(audio.duration);
      }
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrTime(0); globalPlayingAudio = null; };
    const onLoaded = () => { if (audio.duration && isFinite(audio.duration)) setTotalDuration(audio.duration); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('loadedmetadata', onLoaded);
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('ended', onEnd); audio.removeEventListener('loadedmetadata', onLoaded); };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      globalPlayingAudio = null;
    } else {
      // Pause any other playing audio
      if (globalPlayingAudio && globalPlayingAudio !== audio) {
        globalPlayingAudio.pause();
        if (globalPlayingSetter) globalPlayingSetter(false);
      }
      globalPlayingAudio = audio;
      globalPlayingSetter = setPlaying;
      audio.playbackRate = speed;
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing, speed]);

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

  return (
    <div style={audioStyles.container}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button onClick={toggle} style={{ ...audioStyles.playBtn, background: isOwn ? 'rgba(14,165,233,0.25)' : 'var(--bg-elevated)' }}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={audioStyles.middle}>
        <div style={audioStyles.trackOuter} onClick={handleSeek}>
          <div style={{ ...audioStyles.trackFill, width: `${progress}%` }} />
          <div style={{ ...audioStyles.trackThumb, left: `${progress}%` }} />
        </div>
        <div style={audioStyles.timeRow}>
          <span style={audioStyles.timeText}>{fmt(currentTime)}</span>
          <span style={audioStyles.timeText}>{fmt(totalDuration)}</span>
        </div>
      </div>
      <button onClick={cycleSpeed} style={audioStyles.speedBtn}>{speed}x</button>
    </div>
  );
}

const audioStyles = {
  container: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', minWidth: 200 },
  playBtn: {
    width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
    color: 'var(--text-primary)', transition: 'all 0.15s'
  },
  middle: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  trackOuter: {
    height: 6, background: 'var(--bg-hover)', borderRadius: 3, cursor: 'pointer',
    position: 'relative', overflow: 'visible'
  },
  trackFill: {
    height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.1s linear'
  },
  trackThumb: {
    position: 'absolute', top: -3, width: 12, height: 12, borderRadius: '50%',
    background: 'var(--accent)', border: '2px solid var(--bg-surface)', transform: 'translateX(-50%)',
    transition: 'left 0.1s linear'
  },
  timeRow: { display: 'flex', justifyContent: 'space-between' },
  timeText: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  speedBtn: {
    fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-glow)',
    border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', flexShrink: 0
  }
};

function DownloadIcon({ fileUrl }) {
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading || downloaded) return;
    setDownloading(true);
    try {
      const resp = await fetch(fileUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileUrl.split('/').pop() || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch {
      setDownloading(false);
    }
  };

  if (downloaded) return null;

  return (
    <div style={dlStyles.wrap}>
      <span style={{ fontSize: 20, opacity: 0.7 }}>📄</span>
      <button onClick={handleDownload} style={dlStyles.dlBtn} title="Download">
        {downloading ? (
          <span style={dlStyles.spinner} />
        ) : (
          <span style={{ fontSize: 14 }}>⬇</span>
        )}
      </button>
    </div>
  );
}

const dlStyles = {
  wrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px' },
  dlBtn: {
    width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)',
    background: 'var(--bg-elevated)', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
    color: 'var(--text-secondary)', flexShrink: 0
  },
  spinner: {
    width: 12, height: 12, border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)', borderRadius: '50%',
    animation: 'spin 0.6s linear infinite', display: 'block'
  }
};

export default function MessageBubble({ message, onReply }) {
  const { user, updateMessage, setActiveThread, setReplyingTo, hideMessage, activeChannel, deleteMessageForEveryone, messages, setTaskDraft, setRightPanel } = useStore();
  const [showVerdict, setShowVerdict] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' });
  const [showProfile, setShowProfile] = useState(false);
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
  const currentChannel = activeChannel;
  const isAdmin = currentChannel?.admins?.includes(user?._id);
  const canEditPriority = isOwn || isAdmin;

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

  const [isHovered, setIsHovered] = useState(false);
  const isUrgent = message.priority === 'urgent';
  
  const handleUpdatePriority = async (newPriority) => {
    const updated = { ...message, priority: newPriority };
    updateMessage(updated);
    setShowDropdown(false);
    try {
      const socket = (await import('../../utils/socket')).getSocket();
      socket?.emit('messageUpdated', {
        messageId: message._id,
        channelId: message.channel?._id || message.channel,
        updates: { priority: newPriority }
      });
    } catch {}
  };

  const urgentBubbleStyle = isUrgent ? {
    background: 'rgba(239, 68, 68, 0.15)'
  } : {};

  const hasIntentTag = message.intentType && message.intentType !== 'discussion';

  return (
    <div 
      id={`msg-${message._id}`} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.row,
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        animation: 'fadeIn 0.2s ease both'
      }} 
      className="animate-fade"
    >
      {/* Avatar — only for others */}
      {!isOwn && (
        <div style={styles.avatarWrap} onClick={() => setShowProfile(true)}>
          <Avatar user={message.sender} size={30} style={{ cursor: 'pointer' }} />
        </div>
      )}

      {/* Bubble */}
      <div style={{
        ...styles.bubble,
        ...(isOwn ? styles.bubbleOwn : styles.bubbleOther),
        borderTopRightRadius: isOwn ? 4 : 16,
        borderTopLeftRadius: isOwn ? 16 : 4,
        ...urgentBubbleStyle
      }}>
        {/* Sender name — only for others */}
        {!isOwn && (
          <div style={styles.senderName} onClick={() => setShowProfile(true)}>{message.sender?.name || 'Unknown'}</div>
        )}

        {/* Meta row for intent/resolved badges (only render if there's something to show) */}
        {(hasIntentTag || message.isResolved) && (
          <div style={styles.meta}>
            {hasIntentTag && intent && intent.icon && intent.label && (
              <span className={`intent-badge intent-${message.intentType}`}>
                {intent.icon} {intent.label}
              </span>
            )}
            {message.isResolved && <span style={styles.resolved}>✓ Resolved</span>}
          </div>
        )}

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
              {parentMessage.sender?._id === user?._id ? 'You' : (parentMessage.sender?.name || 'Unknown')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {parentMessage.content 
                ? (parentMessage.content.length > 50 ? parentMessage.content.substring(0, 50) + '...' : parentMessage.content) 
                : (parentMessage.attachments?.length > 0 ? '📎 Attachment' : '...')}
            </div>
          </div>
        )}

        {/* Content — text messages */}
        {message.messageType !== 'audio' && (
          <div style={{ ...styles.content, ...(message.isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : {}) }}>
            {message.content ? message.content.split(/(@\w+)/g).map((part, i) => 
              part.startsWith('@') ? (
                <span key={i} style={styles.mention}>{part}</span>
              ) : part
            ) : null}
          </div>
        )}

        {/* Audio player — voice notes */}
        {message.messageType === 'audio' && message.attachments?.[0] && (() => {
          const att = message.attachments[0];
          const actualUrl = att.url?.startsWith('/uploads/') ? att.url : (att.url?.startsWith('blob:') ? att.url : `/uploads/${att.url}`);
          const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
          const audioUrl = att.url?.startsWith('blob:') ? att.url : `${backendUrl}${actualUrl}`;
          return <AudioPlayer audioUrl={audioUrl} duration={message.audioDuration || 0} isOwn={isOwn} />;
        })()}

        {message.verdict && (
          <div style={styles.verdictBox}>
            <span style={styles.verdictLabel}>Verdict</span>
            <span style={styles.verdictText}>{message.verdict}</span>
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && message.messageType !== 'audio' && (
          <div style={styles.attachments}>
            {message.attachments.map((att, i) => {
              const isImage = att.type?.startsWith('image/');
              const isAudio = att.type?.startsWith('audio/');
              if (isAudio) return null; // handled by AudioPlayer
              const actualUrl = att.url?.startsWith('/uploads/') ? att.url : `/uploads/${att.url}`;
              const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
              const fileUrl = `${backendUrl}${actualUrl}`;
              return (
                <div key={i} style={styles.attachment}>
                  {isImage ? (
                    <a href={fileUrl} target="_blank" rel="noreferrer">
                      <img src={fileUrl} alt="" style={styles.imagePreview} />
                    </a>
                  ) : (
                    <DownloadIcon fileUrl={fileUrl} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Thread replies (if any) */}
        {message.replyCount > 0 && (
          <div style={{ ...styles.actions, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
            <button onClick={() => setActiveThread(message)} style={styles.threadBtn}>
              💬 {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          </div>
        )}

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

        {/* Timestamp and Action Menu — bottom-right like WhatsApp */}
        <div style={{ ...styles.timeRow, justifyContent: 'flex-end', marginTop: 4 }}>
          <span style={styles.time}>{formatTime(message.createdAt)}</span>
          
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 4 }}>
            <button 
              ref={triggerRef} 
              onClick={toggleDropdown} 
              style={{ ...styles.actionBtn, opacity: (isHovered || showDropdown) ? 1 : 0 }} 
              title="More actions"
            >
              ⋮
            </button>
            
            {showDropdown && createPortal(
              <div ref={dropdownRef} style={{ ...styles.dropdownMenu, top: dropdownPos.top, bottom: dropdownPos.bottom, left: dropdownPos.left, right: dropdownPos.right }}>
                {message.isDeleted ? (
                  <button className="dropdown-item"
                    onClick={() => { hideMessage(message.channel?._id || message.channel, message._id); setShowDropdown(false); }} 
                    style={styles.dropdownItem}
                  >Delete for me</button>
                ) : (
                  <>
                    <button className="dropdown-item" onClick={() => { setReplyingTo(message); setShowDropdown(false); setActiveThread(null); }} style={styles.dropdownItem}>Reply</button>
                    <button className="dropdown-item" onClick={() => { 
                      setTaskDraft({ title: message.content, sourceMessage: message._id }); 
                      setRightPanel('tasks'); 
                      setShowDropdown(false); 
                    }} style={styles.dropdownItem}>Create Task</button>
                    
                    {canEditPriority && !isUrgent && (
                      <button className="dropdown-item" onClick={() => handleUpdatePriority('urgent')} style={styles.dropdownItem}>Mark as urgent</button>
                    )}
                    {canEditPriority && isUrgent && (
                      <button className="dropdown-item" onClick={() => handleUpdatePriority('normal')} style={styles.dropdownItem}>Remove urgent</button>
                    )}

                    <button className="dropdown-item"
                      onClick={() => { hideMessage(message.channel?._id || message.channel, message._id); setShowDropdown(false); }} 
                      style={styles.dropdownItem}
                    >Delete for me</button>
                    
                    {(isAdmin || isOwn) && !message.isTemp && (
                      <button className="dropdown-item"
                        onClick={() => { deleteMessageForEveryone(message.channel?._id || message.channel, message._id); setShowDropdown(false); }} 
                        style={{ ...styles.dropdownItem, color: '#ef4444' }}
                      >Delete for everyone</button>
                    )}
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      <UserProfileModal 
        isOpen={showProfile} 
        onClose={() => setShowProfile(false)} 
        user={message.sender} 
      />
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
    background: 'rgba(128, 128, 128, 0.06)',
    border: '1px solid rgba(128, 128, 128, 0.12)',
  },
  senderName: {
    fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 2, cursor: 'pointer'
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
  attachment: { overflow: 'hidden', borderRadius: 8 },
  imagePreview: { maxWidth: '100%', maxHeight: 250, display: 'block', objectFit: 'contain', background: 'var(--bg-void)', borderRadius: 8 },
  retryBtn: { background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }
};
