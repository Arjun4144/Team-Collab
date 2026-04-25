import React, { useState, useRef, useCallback, useEffect } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import { intentConfig, priorityConfig, getInitials } from '../../utils/helpers';

const INTENTS  = Object.keys(intentConfig).filter(i => i !== 'discussion');
const PRIORITIES = Object.keys(priorityConfig);
const MAX_RECORD_SEC = 120; // 2 minutes

export default function MessageComposer({ onSent, onSummarize }) {
  const { activeChannel, user, addMessage, users, replyingTo, setReplyingTo, activeThread, setActiveThread } = useStore();
  const [content, setContent]   = useState('');
  const [intent, setIntent]     = useState('');
  const [priority, setPriority] = useState('normal');
  const [sending, setSending]   = useState(false);
  const [file, setFile]         = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Mention state
  const [mentionState, setMentionState] = useState({ show: false, query: '', startIndex: -1 });
  const [mentionIndex, setMentionIndex] = useState(0);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [micError, setMicError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const streamRef = useRef(null);

  const contextMsg = replyingTo;
  const isThread = false;

  const typingTimer = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

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

  const isTypingRef = useRef(false);

  const emitTyping = useCallback(() => {
    if (!activeChannel) return;
    const s = getSocket();
    
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      s?.emit('typing:start', { channelId: activeChannel._id });
    }

    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false;
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
    const tempMessage = {
      _id: tempId,
      channel: activeChannel,
      content: content.trim(),
      intentType: intent || 'discussion',
      priority,
      sender: user,
      createdAt: new Date().toISOString(),
      status: 'sending',
      attachments: file ? [{ name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file) }] : [],
      localFile: file,
      threadParent: replyingTo ? (replyingTo._id || replyingTo) : (activeThread ? (activeThread._id || activeThread) : null),
      replyCount: 0
    };
    
    useStore.getState().addMessage(tempMessage);
    
    setContent('');
    setFile(null);
    setUploadProgress(0);
    setMentionState({ show: false, query: '', startIndex: -1 });
    setPriority('normal');
    setIntent('');
    if (replyingTo) setReplyingTo(null);
    onSent?.();
    const s = getSocket();
    clearTimeout(typingTimer.current);
    isTypingRef.current = false;
    s?.emit('typing:stop', { channelId: activeChannel._id });

    useStore.getState().performSend(tempMessage);
  };

  // ── Voice Recording ──
  const startRecording = async () => {
    if (isRecording || !activeChannel) return;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100); // collect chunks every 100ms
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= MAX_RECORD_SEC - 1) {
            stopAndSendRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      if (err.name === 'NotAllowedError') {
        setMicError('Microphone permission denied');
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found');
      } else {
        setMicError('Could not access microphone');
      }
      setTimeout(() => setMicError(null), 4000);
    }
  };

  const cleanupRecording = () => {
    clearInterval(recordingTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null; // prevent send on stop
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    cleanupRecording();
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    const duration = recordingTime;
    
    mediaRecorderRef.current.onstop = () => {
      const chunks = audioChunksRef.current;
      if (chunks.length === 0 || duration < 1) {
        cleanupRecording();
        return;
      }

      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: mimeType });
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const audioFile = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
      
      sendVoiceNote(audioFile, duration);
      cleanupRecording();
    };

    clearInterval(recordingTimerRef.current);
    mediaRecorderRef.current.stop();
  };

  const sendVoiceNote = (audioFile, duration) => {
    if (!activeChannel) return;
    const tempId = 'temp_' + Date.now();
    const tempMessage = {
      _id: tempId,
      channel: activeChannel,
      content: '',
      intentType: 'discussion',
      priority: 'normal',
      sender: user,
      createdAt: new Date().toISOString(),
      status: 'sending',
      messageType: 'audio',
      audioDuration: duration,
      attachments: [{ name: audioFile.name, size: audioFile.size, type: audioFile.type, url: URL.createObjectURL(audioFile) }],
      localFile: audioFile,
      threadParent: replyingTo ? (replyingTo._id || replyingTo) : (activeThread ? (activeThread._id || activeThread) : null),
      replyCount: 0
    };

    useStore.getState().addMessage(tempMessage);
    if (replyingTo) setReplyingTo(null);
    onSent?.();
    useStore.getState().performSend(tempMessage);
  };

  const formatRecTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const getReplyPreview = (msg) => {
    if (!msg) return 'Original message not available';
    if (msg.messageType === 'audio') return '🎤 Voice note';
    let text = msg.content;
    if (!text) {
      if (msg.attachments && msg.attachments.length > 0) text = 'Attachment';
      else text = 'Message';
    }
    if (text.length > 50) text = text.substring(0, 50) + '...';
    return text;
  };

  const cfg = intent ? intentConfig[intent] : null;
  const hasContent = content.trim().length > 0 || !!file;

  return (
    <form onSubmit={send} style={styles.form}>
      {!isRecording && (
        <div style={styles.toolbar}>
          <div style={styles.intentRow}>
            {INTENTS.map(i => (
              <button key={i} type="button" onClick={() => setIntent(intent === i ? '' : i)}
                style={{ ...styles.intentBtn, ...(intent === i ? { background: `rgba(${intentBg[i]},0.15)`, borderColor: `rgba(${intentBg[i]},0.4)`, color: intentColor[i] } : {}) }}>
                {intentConfig[i].icon} {intentConfig[i].label}
              </button>
            ))}
          </div>
          <div style={styles.priorityRow}>
            <button type="button" onClick={() => setPriority(priority === 'urgent' ? 'normal' : 'urgent')}
              style={{ ...styles.priorityBtn, ...(priority === 'urgent' ? styles.priorityActive : {}) }}>
              <span className="priority-dot priority-urgent" /> Urgent
            </button>
          </div>
        </div>
      )}

      {!isRecording && intent && (
        <div style={styles.intentIndicator}>
          <span style={{ color: intentColor[intent], fontSize: 13 }}>{cfg.icon} {cfg.label}</span>
          {intent === 'action' && <span style={styles.hint}>→ Will auto-create a task</span>}
          {intent === 'decision' && <span style={styles.hint}>→ Will be logged to Decision Log</span>}
          {intent === 'announcement' && <span style={styles.hint}>→ All members will be notified</span>}
        </div>
      )}

      {replyingTo && (
        <div style={styles.replyPreviewBox}>
          <div style={styles.replyPreviewContent}>
            <div style={styles.replySender}>{replyingTo.sender?._id === user?._id ? 'You' : (replyingTo.sender?.name || 'Unknown')}</div>
            <div style={styles.replyText}>{getReplyPreview(replyingTo)}</div>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} style={styles.cancelReplyBtn}>✕</button>
        </div>
      )}

      {micError && <div style={styles.micErrorBar}>{micError}</div>}

      <div style={{ position: 'relative' }}>
        {!isRecording && mentionState.show && mentionSuggestions.length > 0 && (
          <ul style={styles.mentionList}>
            {mentionSuggestions.map((u, idx) => (
              <li key={u._id} style={{ ...styles.mentionItem, ...(idx === mentionIndex ? styles.mentionItemActive : {}) }}
                onClick={() => insertMention(u)} onMouseEnter={() => setMentionIndex(idx)}>
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
          {/* Left: attach button and summarize button */}
          {!isRecording && (
            <>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={styles.attachBtn} title="Attach file">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </button>
              {onSummarize && (
                <button type="button" onClick={onSummarize} style={styles.summarizeBtn} title="Summarize conversation">
                  ⚡
                </button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.txt,audio/*" />
            </>
          )}

          {/* Center: input or recording bar */}
          {isRecording ? (
            <div style={styles.recordingBar}>
              <div style={styles.recordingPulse} />
              <span style={styles.recordingTimer}>{formatRecTime(recordingTime)}</span>
              <div style={styles.recordingWave}>
                {[...Array(16)].map((_, i) => (
                  <div key={i} style={{ ...styles.waveBar, animationDelay: `${i * 0.06}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {file && (
                <div style={styles.fileChip}>
                  <span style={styles.fileChipIcon}>📎</span>
                  <span style={styles.fileChipName}>{file.name.length > 20 ? file.name.substring(0, 18) + '…' : file.name}</span>
                  <button type="button" onClick={() => setFile(null)} style={styles.fileChipClose}>✕</button>
                </div>
              )}
              <textarea
                ref={textareaRef} style={styles.textarea}
                placeholder={`Message${intent ? ' (' + intent + ')' : ''}…`}
                value={content} onChange={handleTextChange} onKeyDown={handleKeyDown} rows={1}
              />
            </div>
          )}

          {/* Right: cancel / mic-or-send */}
          {isRecording ? (
            <>
              <button type="button" onClick={cancelRecording} style={styles.iconBtn} title="Cancel">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button type="button" onClick={stopAndSendRecording} style={styles.sendBtn} title="Send voice note">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </button>
            </>
          ) : hasContent ? (
            <button type="submit" disabled={sending} style={styles.sendBtn} title="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            </button>
          ) : (
            <button type="button" onClick={startRecording} style={styles.micIdleBtn} title="Record voice note">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

const intentBg    = { discussion:'99,102,241', announcement:'245,158,11', decision:'16,185,129', action:'249,115,22', fyi:'139,92,246' };
const intentColor = { discussion:'#818cf8', announcement:'#fbbf24', decision:'#34d399', action:'#fb923c', fyi:'#a78bfa' };

const styles = {
  form: { padding: '10px 16px 8px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 },
  toolbar: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
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
  intentIndicator: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontSize: 12, fontFamily: 'var(--font-mono)' },
  hint: { color: 'var(--text-muted)', fontSize: 11 },
  // Input row — single line
  inputRow: { display: 'flex', gap: 6, alignItems: 'center' },
  textarea: {
    flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 22, padding: '8px 16px', fontSize: 14, color: 'var(--text-primary)',
    resize: 'none', lineHeight: 1.5, transition: 'border-color 0.15s',
    fontFamily: 'var(--font-body)', maxHeight: 120, minHeight: 38
  },
  // Buttons — circular, clean
  attachBtn: {
    width: 38, height: 38, borderRadius: '50%', background: 'none', color: 'var(--text-muted)',
    border: 'none', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s'
  },
  summarizeBtn: {
    width: 38, height: 38, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-primary)',
    border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s'
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: '50%',
    background: 'var(--accent)', color: '#fff',
    border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 700,
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s'
  },
  micIdleBtn: {
    width: 38, height: 38, borderRadius: '50%',
    background: 'none', color: 'var(--text-muted)',
    border: 'none', cursor: 'pointer', fontSize: 20,
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'color 0.15s'
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: '50%', background: 'none', border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'all 0.15s'
  },
  // File chip
  fileChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px 3px 6px',
    background: 'var(--bg-elevated)', borderRadius: 16, fontSize: 11, color: 'var(--text-secondary)',
    marginBottom: 4, maxWidth: '100%'
  },
  fileChipIcon: { fontSize: 12 },
  fileChipName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 },
  fileChipClose: {
    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: 11, padding: 0, marginLeft: 2, display: 'flex', alignItems: 'center'
  },
  // Mentions
  mentionList: {
    position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '6px', margin: 0, listStyle: 'none',
    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', zIndex: 50, maxHeight: 200, overflowY: 'auto', minWidth: 200
  },
  mentionItem: { padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'background 0.1s' },
  mentionItemActive: { background: 'var(--bg-active)' },
  avatar: { width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 },
  mentionName: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' },
  mentionRole: { fontSize: 11, color: 'var(--text-muted)' },
  // Reply
  replyPreviewBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
    padding: '6px 10px', borderRadius: '4px 8px 8px 4px', marginBottom: 8
  },
  replyPreviewContent: { display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 },
  replySender: { fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 },
  replyText: { fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' },
  cancelReplyBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '4px', marginLeft: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  // Recording
  micErrorBar: { fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, fontWeight: 500 },
  recordingBar: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
    background: 'var(--bg-base)', borderRadius: 22, border: '1px solid rgba(239,68,68,0.3)', height: 38
  },
  recordingPulse: { width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0, animation: 'pulse 1s ease-in-out infinite' },
  recordingTimer: { fontSize: 13, fontWeight: 700, color: '#ef4444', fontFamily: 'var(--font-mono)', minWidth: 36 },
  recordingWave: { display: 'flex', alignItems: 'center', gap: 2, height: 20, flex: 1 },
  waveBar: { width: 2, height: 10, borderRadius: 1, background: 'var(--accent)', opacity: 0.5, animation: 'waveAnim 0.6s ease-in-out infinite alternate' },
};
