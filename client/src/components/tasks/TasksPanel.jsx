import React, { useState } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { formatRelative, priorityConfig, getInitials } from '../../utils/helpers';

const STATUS_COLS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

export default function TasksPanel() {
  const { tasks, updateTask, removeTask, users, activeChannel, activeWorkspace, user, taskDraft, setTaskDraft } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'all' or 'me'
  
  const workspaceUsers = activeWorkspace?.members || [];
  
  const [form, setForm] = useState({ title: '', description: '', assignee: user?._id || '', priority: 'normal', dueDate: '', sourceMessage: null });
  const [editForm, setEditForm] = useState({});

  React.useEffect(() => {
    if (taskDraft) {
      setShowNew(true);
      setForm(f => ({ ...f, title: taskDraft.title || '', sourceMessage: taskDraft.sourceMessage }));
      setTaskDraft(null);
    }
  }, [taskDraft, setTaskDraft]);

  React.useEffect(() => {
    // Whenever tasks change and the panel is open, auto-mark them as seen.
    localStorage.setItem('nexus_lastSeenTasks', Date.now().toString());
  }, [tasks]);

  const channelTasks = activeChannel
    ? tasks.filter(t => t.channel?._id === activeChannel._id || t.channel === activeChannel._id)
    : tasks;
    
  const filteredTasks = filterMode === 'me' 
    ? channelTasks.filter(t => (t.assignee?._id || t.assignee) === user?._id)
    : channelTasks;

  const changeStatus = async (task, status) => {
    try {
      const { data } = await api.patch(`/tasks/${task._id}`, { status });
      updateTask(data);
    } catch {}
  };

  const createTask = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/tasks', {
        ...form,
        channel: activeChannel?._id,
        createdBy: user._id
      });
      useStore.getState().addTask(data);
      setShowNew(false);
      setForm({ title: '', description: '', assignee: user?._id || '', priority: 'normal', dueDate: '', sourceMessage: null });
    } catch {}
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch(`/tasks/${editingId}`, editForm);
      updateTask(data);
      setEditingId(null);
    } catch {}
  };

  const startEdit = (task) => {
    setEditingId(task._id);
    setEditForm({
      title: task.title,
      description: task.description || '',
      assignee: task.assignee?._id || task.assignee || '',
      priority: task.priority || 'normal',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : ''
    });
  };

  const confirmDeleteTask = (task) => {
    setTaskToDelete(task);
  };

  const executeDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await api.delete(`/tasks/${taskToDelete._id}`);
      removeTask(taskToDelete._id);
      setTaskToDelete(null);
    } catch {}
  };

  const canDelete = (task) => {
    const creatorId = task.createdBy?._id || task.createdBy;
    if (creatorId === user._id) return true;
    const isChAdmin = activeChannel?.admins?.some(a => (a._id || a) === user._id);
    const isWsAdmin = activeWorkspace?.admins?.some(a => (a._id || a) === user._id);
    return isChAdmin || isWsAdmin;
  };

  const getStatusColor = (status) => {
    if (status === 'todo') return '#9ca3af';
    if (status === 'in_progress') return '#f59e0b';
    if (status === 'done') return '#10b981';
    return '#9ca3af';
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>⚡ Tasks</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={styles.filterSelect} value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
            <option value="all">All Tasks</option>
            <option value="me">My Tasks</option>
          </select>
          <button onClick={() => setShowNew(v => !v)} style={styles.addBtn}>+ New</button>
        </div>
      </div>

      {taskToDelete && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalTitle}>Delete Task</div>
            <div style={styles.modalText}>Are you sure you want to delete "{taskToDelete.title}"?</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={executeDeleteTask} style={{ ...styles.submitBtn, background: '#ef4444' }}>Delete</button>
              <button onClick={() => setTaskToDelete(null)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <form onSubmit={createTask} style={styles.newForm}>
          <label style={styles.label}>Task title</label>
          <input style={styles.inp} placeholder="Task title" required
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          
          <label style={styles.label}>Description (Optional)</label>
          <textarea style={{ ...styles.inp, resize: 'vertical', minHeight: 60 }} placeholder="Task description..."
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          
          <label style={styles.label}>Assigned to</label>
          <select style={styles.inp} value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}>
            <option value="">Unassigned</option>
            {workspaceUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
          
          <label style={styles.label}>Priority (Low / Medium / High)</label>
          <select style={styles.inp} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            {Object.keys(priorityConfig).map(p => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
          </select>
          
          <label style={styles.label}>Due Date</label>
          <input type="date" style={styles.inp} required
            min={new Date().toISOString().split('T')[0]}
            value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" style={styles.submitBtn}>Create</button>
            <button type="button" onClick={() => setShowNew(false)} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>
      )}

      <div style={styles.columns}>
        {STATUS_COLS.map(status => (
          <div key={status} style={styles.col}>
            <div style={styles.colHeader}>
              <span style={styles.colLabel}>{STATUS_LABELS[status]}</span>
              <span style={styles.colCount}>{filteredTasks.filter(t => t.status === status).length}</span>
            </div>
            <div style={styles.colList}>
              {filteredTasks.filter(t => t.status === status).length === 0 && (
                <div style={styles.emptyState}>No tasks yet</div>
              )}
              {filteredTasks.filter(t => t.status === status).map(task => {
                const isAssignedToMe = (task.assignee?._id || task.assignee) === user?._id;
                return (
                  <div key={task._id} style={{ 
                    ...styles.taskCard, 
                    borderLeftColor: getStatusColor(task.status),
                    background: isAssignedToMe ? 'var(--bg-elevated)' : 'var(--bg-base)'
                  }}>
                  {editingId === task._id ? (
                    <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input style={styles.inp} required value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                      <textarea style={{ ...styles.inp, resize: 'vertical', minHeight: 60 }} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Description..." />
                      <select style={styles.inp} value={editForm.assignee} onChange={e => setEditForm(f => ({ ...f, assignee: e.target.value }))}>
                        <option value="">Unassigned</option>
                        {workspaceUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                      </select>
                      <select style={styles.inp} value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}>
                        {Object.keys(priorityConfig).map(p => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
                      </select>
                      <input type="date" style={styles.inp} required value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="submit" style={styles.submitBtn}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)} style={styles.cancelBtn}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div style={styles.taskTop}>
                        <span style={styles.taskTitle}>{task.title}</span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEdit(task)} style={styles.iconBtn}>✏️</button>
                          {canDelete(task) && <button onClick={() => confirmDeleteTask(task)} style={styles.del}>✕</button>}
                        </div>
                      </div>
                      {task.description && (
                        <div style={styles.taskDesc}>{task.description}</div>
                      )}
                      <div style={styles.taskMeta}>
                        <span className={`priority-dot priority-${task.priority}`} />
                        <span style={styles.metaText}>{priorityConfig[task.priority]?.label}</span>
                        {task.assignee && (
                          <>
                            <span style={styles.dot}>·</span>
                            <span style={styles.assigneeChip}>{getInitials(task.assignee.name)}</span>
                            <span style={styles.metaText}>{task.assignee.name}</span>
                          </>
                        )}
                      </div>
                      {task.dueDate && (
                        <div style={{ ...styles.due, color: new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && task.status !== 'done' ? '#ef4444' : 'var(--text-muted)' }}>
                          {new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && task.status !== 'done' ? 'Overdue: ' : 'Due: '}
                          {formatRelative(task.dueDate)}
                        </div>
                      )}
                      {task.sourceMessage && (
                        <div 
                          style={styles.sourceMsg} 
                          onClick={() => {
                            const el = document.getElementById(`msg-${task.sourceMessage}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.style.transition = 'background-color 0.3s ease';
                              const oldBg = el.style.backgroundColor;
                              el.style.backgroundColor = 'var(--bg-active)';
                              setTimeout(() => {
                                el.style.backgroundColor = oldBg;
                              }, 2000);
                            }
                          }}
                        >
                          🔗 From message
                        </div>
                      )}
                      <div style={styles.statusBtns}>
                        {STATUS_COLS.filter(s => s !== status).map(s => (
                          <button key={s} onClick={() => changeStatus(task, s)} style={styles.statusBtn}>
                            → {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    width: 'var(--panel-width)', borderLeft: '1px solid var(--border)',
    background: 'var(--bg-base)', display: 'flex', flexDirection: 'column',
    flexShrink: 0, overflow: 'hidden'
  },
  header: {
    padding: '14px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
  },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' },
  addBtn: {
    padding: '5px 12px', background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  newForm: {
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0
  },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' },
  inp: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)', width: '100%',
    marginBottom: 4
  },
  submitBtn: {
    flex: 1, padding: '8px', background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  cancelBtn: {
    flex: 1, padding: '8px', background: 'var(--bg-hover)', color: 'var(--text-primary)',
    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  columns: { flex: 1, overflowY: 'auto', padding: '12px' },
  col: { marginBottom: 20 },
  colHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, padding: '0 2px'
  },
  colLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  colCount: {
    fontSize: 10, padding: '1px 6px', borderRadius: 10,
    background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)'
  },
  colList: { display: 'flex', flexDirection: 'column', gap: 8 },
  emptyState: { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 4px' },
  taskCard: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderLeftWidth: 4, borderRadius: 8, padding: '10px 12px'
  },
  taskTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  taskTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, flex: 1, marginRight: 8 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' },
  del: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, flexShrink: 0 },
  taskDesc: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  taskMeta: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: 'var(--text-muted)' },
  dot: { color: 'var(--text-muted)', fontSize: 11 },
  assigneeChip: {
    width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-active)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 8, fontWeight: 700, color: 'var(--accent)'
  },
  due: { fontSize: 11, marginTop: 4, fontWeight: 500 },
  createdBy: { fontSize: 10, color: 'var(--text-muted)', marginTop: 6 },
  statusBtns: { display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  statusBtn: {
    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer'
  },
  sourceMsg: { fontSize: 10, color: 'var(--accent)', marginTop: 4, cursor: 'pointer', display: 'inline-block', fontWeight: 600 },
  filterSelect: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '4px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer'
  },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
  },
  modalContent: {
    background: 'var(--bg-surface)', padding: 16, borderRadius: 8, width: 260,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', border: '1px solid var(--border)'
  },
  modalTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  modalText: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }
};
