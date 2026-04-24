import React, { useEffect, useState } from 'react';
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
  const { token, user, setUser, fetchChannels, fetchTasks, fetchDecisions, fetchUsers, rightPanel, activeThread, toast, channels, activeChannel, setActiveChannel, setToast } = useStore();
  const [socket, setSocket] = useState(null);

  useSocket(socket);

  useEffect(() => {
    if (!token) return;
    // Boot socket
    const s = initSocket(token);
    setSocket(s);

    // Load initial data
    fetchChannels();
    fetchTasks();
    fetchDecisions();
    fetchUsers();

    // Fetch current user if needed
    if (!user) {
      import('../utils/api').then(({ default: api }) => {
        api.get('/auth/me').then(r => setUser(r.data.user)).catch(() => {});
      });
    }

    return () => { s.disconnect(); setSocket(null); };
  }, [token]);

  return (
    <div style={styles.workspace}>
      <Sidebar />

      <div style={styles.main}>
        <ChannelHeader />
        <div style={styles.content}>
          <ChatArea />
          {activeThread && <ThreadPanel />}
        </div>
      </div>

      {activeChannel && rightPanel === 'tasks'     && <TasksPanel />}
      {activeChannel && rightPanel === 'decisions' && <DecisionsPanel />}
      {activeChannel && rightPanel === 'members'   && <MembersPanel />}

      {/* Toast Notification */}
      {toast && (
        <div style={{...styles.toast, cursor: toast.channelId ? 'pointer' : 'default'}} onClick={() => {
          if (toast.channelId) {
            const ch = channels.find(c => c._id === toast.channelId);
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
  content: { flex: 1, display: 'flex', overflow: 'hidden' },
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
