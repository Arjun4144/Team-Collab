import React, { useState } from 'react';
import useStore from '../../store/useStore';
import api from '../../utils/api';
import { formatRelative, getInitials } from '../../utils/helpers';

export default function DecisionsPanel() {
  const { decisions, addDecision, user, activeChannel } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', rationale: '' });
  const [filter, setFilter] = useState('all');

  const channelDecisions = activeChannel
    ? decisions.filter(d => d.channel?._id === activeChannel._id || d.channel === activeChannel._id)
    : decisions;

  const filtered = filter === 'all' ? channelDecisions : channelDecisions.filter(d => d.status === filter);

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/decisions', {
        ...form,
        channel: activeChannel?._id,
        owner: user._id
      });
      addDecision(data);
      setShowNew(false);
      setForm({ title: '', body: '', rationale: '' });
    } catch {}
  };

  const acknowledge = async (id) => {
    try {
      await api.patch(`/decisions/${id}/acknowledge`);
    } catch {}
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>✅ Decision Log</span>
        <button onClick={() => setShowNew(v => !v)} style={styles.addBtn}>+ Log</button>
      </div>

      <div style={styles.filterRow}>
        {['all', 'active', 'superseded'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...styles.filterBtn, ...(filter === f ? styles.filterActive : {}) }}>
            {f}
          </button>
        ))}
      </div>

      {showNew && (
        <form onSubmit={create} style={styles.newForm}>
          <input style={styles.inp} placeholder="Decision title" required
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea style={styles.ta} placeholder="What was decided?" rows={3} required
            value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          <textarea style={styles.ta} placeholder="Rationale (optional)" rows={2}
            value={form.rationale} onChange={e => setForm(f => ({ ...f, rationale: e.target.value }))} />
          <button type="submit" style={styles.submitBtn}>Log decision</button>
        </form>
      )}

      <div style={styles.list}>
        {filtered.length === 0 && (
          <div style={styles.empty}>No decisions logged yet.<br />Send a message with <strong>Decision</strong> intent to auto-log.</div>
        )}
        {filtered.map(d => (
          <div key={d._id} style={styles.card}>
            <div style={styles.cardTop}>
              <span style={{ ...styles.status, ...(d.status === 'active' ? styles.statusActive : styles.statusOther) }}>
                {d.status}
              </span>
              <span style={styles.time}>{formatRelative(d.createdAt)}</span>
            </div>
            <div style={styles.cardTitle}>{d.title}</div>
            <div style={styles.cardBody}>{d.body}</div>
            {d.rationale && (
              <div style={styles.rationale}>
                <span style={styles.rationaleLabel}>Rationale</span>
                <span style={styles.rationaleText}>{d.rationale}</span>
              </div>
            )}
            <div style={styles.cardFooter}>
              <div style={styles.owner}>
                <div style={styles.ownerAvatar}>{getInitials(d.owner?.name)}</div>
                <span style={styles.ownerName}>{d.owner?.name}</span>
              </div>
              {d.acknowledgedBy && !d.acknowledgedBy.includes(user?._id) && (
                <button onClick={() => acknowledge(d._id)} style={styles.ackBtn}>Acknowledge</button>
              )}
              {d.acknowledgedBy?.includes(user?._id) && (
                <span style={styles.acked}>✓ Acknowledged</span>
              )}
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
    padding: '5px 12px', background: 'rgba(16,185,129,0.15)', color: '#34d399',
    border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  filterRow: { display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  filterBtn: {
    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize'
  },
  filterActive: { background: 'var(--bg-elevated)', color: 'var(--text-primary)' },
  newForm: {
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0
  },
  inp: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)', width: '100%'
  },
  ta: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)',
    width: '100%', resize: 'none', fontFamily: 'var(--font-body)'
  },
  submitBtn: {
    padding: '8px', background: 'rgba(16,185,129,0.2)', color: '#34d399',
    border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  list: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 },
  empty: {
    color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 16px', lineHeight: 1.7
  },
  card: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '12px'
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  status: { fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  statusActive: { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' },
  statusOther: { background: 'var(--bg-elevated)', color: 'var(--text-muted)' },
  time: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 },
  cardBody: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 },
  rationale: {
    background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px',
    marginBottom: 8, display: 'flex', gap: 8
  },
  rationaleLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, marginTop: 1, textTransform: 'uppercase' },
  rationaleText: { fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  owner: { display: 'flex', alignItems: 'center', gap: 6 },
  ownerAvatar: {
    width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-active)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'var(--accent)'
  },
  ownerName: { fontSize: 11, color: 'var(--text-muted)' },
  ackBtn: {
    padding: '3px 10px', fontSize: 10, fontWeight: 600,
    background: 'var(--accent-glow)', color: 'var(--accent)',
    border: '1px solid rgba(14,165,233,0.3)', borderRadius: 4, cursor: 'pointer'
  },
  acked: { fontSize: 10, color: '#34d399', fontWeight: 600 }
};
