import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { formatRelative } from '../../utils/helpers';
import useOnClickOutside from '../../hooks/useOnClickOutside';

export default function NotificationBell() {
  const { notifications, fetchNotifications, markAllNotificationsRead, clearNotifications, removeNotification, selectWorkspace, workspaces, channels, user } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);

  useOnClickOutside(dropdownRef, (e) => {
    if (btnRef.current && !btnRef.current.contains(e.target)) {
      setIsOpen(false);
    }
  });

  useLayoutEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        left: Math.max(10, rect.left - 280) // 320 is width, rect.left is icon pos. Try to align right edge.
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  useEffect(() => {
    if (isOpen) {
      if (notifications.some(n => !n.isRead)) {
        api.post('/notifications/mark-read').then(() => {
          markAllNotificationsRead();
        }).catch(console.error);
      }
    }
  }, [isOpen, notifications, markAllNotificationsRead]);

  const handleClearAll = async () => {
    try {
      await api.post('/notifications/clear');
      clearNotifications();
    } catch {}
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      removeNotification(id);
    } catch {}
  };

  const handleNotifClick = async (n) => {
    if (n.workspaceId) {
      const ws = workspaces.find(w => w._id === n.workspaceId);
      if (ws) {
        await selectWorkspace(ws);
      }
    }
    if (n.channelId) {
      const state = useStore.getState();
      const chList = state.channels[n.workspaceId] || [];
      const ch = chList.find(c => c._id === n.channelId);
      if (ch) {
        await state.selectChannel(ch);
      }
      if (n.type === 'task_assigned') {
        if (!state.tasks.some(t => String(t._id) === String(n.referenceId))) {
          state.showToast('Task no longer available');
          setIsOpen(false);
          return;
        }
        state.setRightPanel('tasks');
      } else if (n.referenceId) {
        // It's a mention or message
        setTimeout(() => {
          const el = document.getElementById(`msg-${n.referenceId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'background-color 0.3s ease';
            const oldBg = el.style.backgroundColor;
            el.style.backgroundColor = 'var(--bg-active)';
            setTimeout(() => { el.style.backgroundColor = oldBg; }, 2000);
          } else {
            state.showToast('Message not found');
          }
        }, 300);
      }
    }
    setIsOpen(false);
  };

  let displayNotifs = [...notifications];
  const unreadMentions = notifications.filter(n => n.type === 'mention' && !n.isRead);
  
  if (unreadMentions.length > 5) {
    const mentionNotifs = notifications.filter(n => n.type === 'mention');
    const nonMentionNotifs = notifications.filter(n => n.type !== 'mention');
    
    displayNotifs = [
      {
        _id: 'grouped-mentions',
        type: 'mention_aggregated',
        title: 'Multiple Mentions',
        body: `You were mentioned ${mentionNotifs.length} times recently.`,
        isRead: false,
        createdAt: mentionNotifs[0]?.createdAt || new Date(),
        workspaceId: mentionNotifs[0]?.workspaceId,
        channelId: mentionNotifs[0]?.channelId
      },
      ...nonMentionNotifs
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div style={{ position: 'relative' }}>
      <button 
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        style={styles.bellBtn}
      >
        🔔
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && createPortal(
        <div ref={dropdownRef} style={{ ...styles.dropdown, top: dropdownPos.top, left: dropdownPos.left }}>
          <div style={styles.header}>
            <span style={styles.title}>Notifications</span>
            {displayNotifs.length > 0 && (
              <button onClick={handleClearAll} style={styles.clearBtn}>Clear all</button>
            )}
          </div>
          <div style={styles.list}>
            {displayNotifs.length === 0 ? (
              <div style={styles.empty}>No notifications</div>
            ) : (
              displayNotifs.map(n => (
                <div 
                  key={n._id} 
                  style={{ ...styles.item, opacity: n.isRead ? 0.7 : 1 }}
                  onClick={() => handleNotifClick(n)}
                >
                  <div style={styles.itemTop}>
                    <span style={styles.itemTitle}>
                      {n.title}
                    </span>
                    <span style={styles.time}>{formatRelative(n.createdAt)}</span>
                  </div>
                  <div style={styles.itemBody}>{n.body}</div>
                  {n._id !== 'grouped-mentions' && (
                    <button 
                      onClick={(e) => handleDelete(e, n._id)} 
                      style={styles.delBtn}
                    >✕</button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const styles = {
  bellBtn: {
    background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
    position: 'relative', width: 32, height: 32, display: 'flex',
    alignItems: 'center', justifyContent: 'center', borderRadius: 8
  },
  badge: {
    position: 'absolute', top: 2, right: 2, background: '#ef4444',
    color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 4px',
    borderRadius: 10, minWidth: 14, textAlign: 'center'
  },
  dropdown: {
    position: 'absolute', width: 320,
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: 99999, display: 'flex', flexDirection: 'column',
    maxHeight: 400
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0
  },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  clearBtn: {
    background: 'none', border: 'none', fontSize: 12, color: 'var(--accent)',
    cursor: 'pointer', fontWeight: 500
  },
  list: {
    flex: 1, overflowY: 'auto', padding: '8px'
  },
  empty: {
    padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13
  },
  item: {
    padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
    position: 'relative', transition: 'background 0.2s', marginBottom: 4,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)'
  },
  itemTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 4, paddingRight: 20
  },
  itemTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  time: { fontSize: 11, color: 'var(--text-muted)' },
  itemBody: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 },
  delBtn: {
    position: 'absolute', top: 10, right: 10, background: 'none', border: 'none',
    fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5
  }
};
