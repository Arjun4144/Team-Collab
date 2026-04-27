import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { initSocket } from '../utils/socket';
import { useSocket } from '../hooks/useSocket';
import Sidebar from '../components/layout/Sidebar';
import ChannelHeader from '../components/layout/ChannelHeader';
import ChatArea from '../components/chat/ChatArea';
import ThreadPanel from '../components/chat/ThreadPanel';
import TasksPanel from '../components/tasks/TasksPanel';
import DecisionsPanel from '../components/decisions/DecisionsPanel';
import MembersPanel from '../components/layout/MembersPanel';
import ProfileModal from '../components/layout/ProfileModal';
import ConfirmationModal from '../components/layout/ConfirmationModal';

export default function WorkspacePage() {
  const { 
    token, user, setUser, workspaces, fetchWorkspaces, fetchTasks, fetchDecisions, fetchWorkspaceMembers, fetchUsers, 
    rightPanel, activeThread, toast, activeWorkspace, activeChannel, setToast, 
    selectWorkspace, selectChannel, profileUser, setProfileUser, confirmModal
  } = useStore();
  const [socket, setSocket] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const { workspaceId: urlWorkspaceId, channelId: urlChannelId } = useParams();
  const navigate = useNavigate();

  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isResizerHovered, setIsResizerHovered] = useState(false);

  // Panel resizer logic
  const startResizePanel = (e) => {
    e.preventDefault();
    setIsResizingPanel(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const startX = e.clientX;
    const root = document.documentElement;
    const startWidth = parseInt(getComputedStyle(root).getPropertyValue('--panel-width')) || 300;

    const onMove = (moveEvent) => {
      // For right panel, dragging left increases width, dragging right decreases
      const newWidth = Math.max(220, Math.min(600, startWidth - (moveEvent.clientX - startX)));
      root.style.setProperty('--panel-width', `${newWidth}px`);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('nexus_panel_width', root.style.getPropertyValue('--panel-width').replace('px', ''));
      setIsResizingPanel(false);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  useSocket(socket);

  useEffect(() => {
    if (!token) return;
    // Boot socket
    const s = initSocket(token);
    setSocket(s);

    // Load saved panel width
    const savedPanelW = localStorage.getItem('nexus_panel_width');
    if (savedPanelW) document.documentElement.style.setProperty('--panel-width', `${savedPanelW}px`);

    // Load initial data
    fetchTasks();
    fetchDecisions();
    fetchUsers();

    if (!user) {
      import('../utils/api').then(({ default: api }) => {
        api.get('/auth/me').then(r => setUser(r.data.user)).catch(() => {});
      });
    }

    fetchWorkspaces().then(workspacesList => {
      if (workspacesList && workspacesList.length > 0) {
        let targetWs = null;
        if (urlWorkspaceId) {
          targetWs = workspacesList.find(ws => ws._id === urlWorkspaceId);
          if (!targetWs) {
            console.warn('Unauthorized or invalid workspace access attempt');
            targetWs = workspacesList[0];
            navigate(`/workspace/${targetWs._id}`, { replace: true });
          }
        }
        
        if (!targetWs) {
          const lastWsId = localStorage.getItem('nexus_last_workspace');
          if (lastWsId) targetWs = workspacesList.find(ws => ws._id === lastWsId);
        }
        if (!targetWs) targetWs = workspacesList[0];
        
        if (targetWs) {
          selectWorkspace(targetWs).then(() => {
            if (urlChannelId) {
              const state = useStore.getState();
              const wsChannels = state.channels[targetWs._id] || [];
              const urlCh = wsChannels.find(c => c._id === urlChannelId);
              if (urlCh) selectChannel(urlCh);
            }
            setInitialized(true);
          });
        } else {
          setInitialized(true);
        }
      } else {
        setInitialized(true);
      }
    });

    return () => { s.disconnect(); setSocket(null); };
  }, [token, urlWorkspaceId]);

  // Sync URL when workspace/channel changes
  useEffect(() => {
    if (!initialized) return;
    if (activeWorkspace && activeChannel) {
      const target = `/workspace/${activeWorkspace._id}/channel/${activeChannel._id}`;
      if (window.location.pathname !== target) {
        navigate(target, { replace: true });
      }
    } else if (activeWorkspace) {
      const target = `/workspace/${activeWorkspace._id}`;
      if (window.location.pathname !== target) {
        navigate(target, { replace: true });
      }
    }
  }, [activeWorkspace?._id, activeChannel?._id, initialized]);

  // Get all channels for current workspace for toast navigation
  const wsChannels = activeWorkspace ? (useStore.getState().channels[activeWorkspace._id] || []) : [];

  return (
    <div style={styles.workspace}>
      <Sidebar />

      <div style={styles.main}>
        <ChannelHeader />
        <div style={styles.content}>
          <ChatArea />
          {activeThread && (
            <div style={styles.rightPanelContainer}>
              <div 
                onMouseDown={startResizePanel} 
                onMouseEnter={() => setIsResizerHovered(true)}
                onMouseLeave={() => setIsResizerHovered(false)}
                style={{ ...styles.rightResizer, background: (isResizingPanel || isResizerHovered) ? 'var(--accent)' : 'transparent', opacity: (isResizingPanel || isResizerHovered) ? 1 : 0 }} 
              />
              <ThreadPanel />
            </div>
          )}
        </div>
      </div>

      {rightPanel && (
        <div style={styles.rightPanelContainer}>
          <div 
            onMouseDown={startResizePanel} 
            onMouseEnter={() => setIsResizerHovered(true)}
            onMouseLeave={() => setIsResizerHovered(false)}
            style={{ ...styles.rightResizer, background: (isResizingPanel || isResizerHovered) ? 'var(--accent)' : 'transparent', opacity: (isResizingPanel || isResizerHovered) ? 1 : 0 }} 
          />
          {rightPanel === 'tasks' && activeChannel && <TasksPanel />}
          {rightPanel === 'decisions' && activeChannel && <DecisionsPanel />}
          {rightPanel === 'members' && activeChannel && <MembersPanel type="workspace" />}
          {rightPanel === 'all_users' && <MembersPanel type="all" />}
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{...styles.toast, cursor: toast.channelId ? 'pointer' : 'default'}} onClick={async () => {
          if (toast.workspaceId) {
            const ws = workspaces.find(w => w._id === toast.workspaceId);
            if (ws && ws._id !== activeWorkspace?._id) await selectWorkspace(ws);
          }
          if (toast.channelId) {
            const ch = wsChannels.find(c => c._id === toast.channelId);
            if (ch && ch._id !== activeChannel?._id) await useStore.getState().selectChannel(ch);
            if (toast.type === 'task_assigned') {
              if (!useStore.getState().tasks.some(t => String(t._id) === String(toast.messageId))) {
                useStore.getState().showToast('Task no longer available');
                setToast(null);
                return;
              }
              useStore.getState().setRightPanel('tasks');
            } else {
              setTimeout(() => {
                const el = document.getElementById(`msg-${toast.messageId}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.style.transition = 'background-color 0.3s ease';
                  const oldBg = el.style.backgroundColor;
                  el.style.backgroundColor = 'var(--bg-active)';
                  setTimeout(() => { el.style.backgroundColor = oldBg; }, 2000);
                } else {
                  useStore.getState().showToast('Message not found');
                }
              }, 300);
            }
          }
          if (toast.notifId) {
            import('../utils/api').then(({ default: api }) => {
              api.post('/notifications/mark-read', { notifIds: [toast.notifId] }).catch(() => {});
            });
            // eagerly update store
            const store = useStore.getState();
            store.setNotifications(store.notifications.map(n => n._id === toast.notifId ? { ...n, isRead: true } : n));
          }
          setToast(null);
        }}>
          <span style={styles.toastText}>{toast.message || toast}</span>
        </div>
      )}

      {profileUser && (
        <ProfileModal 
          isOpen={true} 
          onClose={() => setProfileUser(null)} 
          user={profileUser} 
        />
      )}
      <ConfirmationModal />
    </div>
  );
}

const styles = {
  workspace: { display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-void)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  content: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  rightPanelContainer: { position: 'relative', display: 'flex', flexShrink: 0 },
  rightResizer: { position: 'absolute', top: 0, left: -2, width: 4, height: '100%', cursor: 'col-resize', zIndex: 50, transition: 'background 0.2s, opacity 0.2s' },
  toast: {
    position: 'absolute', top: 20, right: 20, zIndex: 9999,
    background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.3), 0 0 15px rgba(14,165,233,0.3)',
    padding: '12px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
    animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  toastIcon: { fontSize: 16 },
  toastText: { color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }
};
