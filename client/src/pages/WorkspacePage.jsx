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

export default function WorkspacePage() {
  const { token, user, setUser, fetchWorkspaces, fetchTasks, fetchDecisions, fetchUsers, rightPanel, activeThread, toast, activeWorkspace, activeChannel, setToast, selectWorkspace, selectChannel } = useStore();
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

    // Fetch current user if needed
    if (!user) {
      import('../utils/api').then(({ default: api }) => {
        api.get('/auth/me').then(r => setUser(r.data.user)).catch(() => {});
      });
    }

    // Fetch workspaces and auto-select
    fetchWorkspaces().then(workspaces => {
      if (workspaces && workspaces.length > 0) {
        // Determine which workspace to open
        let targetWs = null;
        if (urlWorkspaceId) {
          targetWs = workspaces.find(ws => ws._id === urlWorkspaceId);
        }
        if (!targetWs) {
          const lastWsId = localStorage.getItem('nexus_last_workspace');
          if (lastWsId) targetWs = workspaces.find(ws => ws._id === lastWsId);
        }
        if (!targetWs) targetWs = workspaces[0];
        
        if (targetWs) {
          selectWorkspace(targetWs).then(() => {
            // If URL has a channel ID, select it
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
  }, [token]);

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
        <div style={{...styles.toast, cursor: toast.channelId ? 'pointer' : 'default'}} onClick={() => {
          if (toast.channelId) {
            const ch = wsChannels.find(c => c._id === toast.channelId);
            if (ch) useStore.getState().selectChannel(ch);
            setTimeout(() => {
              const el = document.getElementById(`msg-${toast.messageId}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
          }
          setToast(null);
        }}>
          <span style={styles.toastIcon}>🔔</span>
          <span style={styles.toastText}>{toast.message || toast}</span>
        </div>
      )}
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
