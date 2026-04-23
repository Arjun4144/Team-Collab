import React, { useState } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { formatRelative, priorityConfig, getInitials } from '../../utils/helpers';

const STATUS_COLS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

export default function TasksPanel() {
  const { tasks, updateTask, removeTask, users, activeChannel, user } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', assignee: '', priority: 'normal', dueDate: '' });

  const channelTasks = activeChannel
    ? tasks.filter(t => t.channel?._id === activeChannel._id || t.channel === activeChannel._id)
    : tasks;

  const changeStatus = async (task, status) => {
    try {
      const { data } = await api.patch(`/tasks/${task._id}`, { status });
      updateTask(data);
      const socket = (await import('../../utils/socket')).getSocket();
      socket?.emit('task:update', data);
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
      setForm({ title: '', assignee: '', priority: 'normal', dueDate: '' });
    } catch {}
  };

  const deleteTask = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      removeTask(id);
    } catch {}
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>⚡ Tasks</span>
        <button onClick={() => setShowNew(v => !v)} style={styles.addBtn}>+ New</button>
      </div>

      {showNew && (
        <form onSubmit={createTask} style={styles.newForm}>
          <input style={styles.inp} placeholder="Task title" required
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <select style={styles.inp} value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}>
            <option value="">Unassigned</option>
            {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
          <select style={styles.inp} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            {Object.keys(priorityConfig).map(p => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
          </select>
          <input type="date" style={styles.inp}
            value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          <button type="submit" style={styles.submitBtn}>Create task</button>
        </form>
      )}

      <div style={styles.columns}>
        {STATUS_COLS.map(status => (
          <div key={status} style={styles.col}>
            <div style={styles.colHeader}>
              <span style={styles.colLabel}>{STATUS_LABELS[status]}</span>
              <span style={styles.colCount}>{channelTasks.filter(t => t.status === status).length}</span>
            </div>
            <div style={styles.colList}>
              {channelTasks.filter(t => t.status === status).map(task => (
                <div key={task._id} style={styles.taskCard}>
                  <div style={styles.taskTop}>
                    <span style={styles.taskTitle}>{task.title}</span>
                    <button onClick={() => deleteTask(task._id)} style={styles.del}>✕</button>
                  </div>
                  <div style={styles.taskMeta}>
                    <span className={`priority-dot priority-${task.priority}`} />
                    <span style={styles.metaText}>{priorityConfig[task.priority]?.label}</span>
                    {task.assignee && (
                      <>
                        <span style={styles.dot}>·</span>
                        <span style={styles.assigneeChip}>
                          {getInitials(task.assignee.name)}
                        </span>
                        <span style={styles.metaText}>{task.assignee.name}</span>
                      </>
                    )}
                  </div>
                  {task.dueDate && (
                    <div style={styles.due}>Due {formatRelative(task.dueDate)}</div>
                  )}
                  <div style={styles.statusBtns}>
                    {STATUS_COLS.filter(s => s !== status).map(s => (
                      <button key={s} onClick={() => changeStatus(task, s)} style={styles.statusBtn}>
                        → {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
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
    display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0
  },
  inp: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)', width: '100%'
  },
  submitBtn: {
    padding: '8px', background: 'var(--accent)', color: '#fff',
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
  taskCard: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px'
  },
  taskTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  taskTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, flex: 1, marginRight: 8 },
  del: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, flexShrink: 0 },
  taskMeta: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: 'var(--text-muted)' },
  dot: { color: 'var(--text-muted)', fontSize: 11 },
  assigneeChip: {
    width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-active)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 8, fontWeight: 700, color: 'var(--accent)'
  },
  due: { fontSize: 11, color: 'var(--priority-high)', marginTop: 4 },
  statusBtns: { display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  statusBtn: {
    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer'
  }
};
