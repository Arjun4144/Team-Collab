import React from 'react';
import useStore from '../../store/useStore';
import { getInitials, statusConfig } from '../../utils/helpers';

export default function MembersPanel() {
  const { activeChannel, users, user: currentUser, removeMember, promoteMember, demoteMember } = useStore();

  const isCurrentUserAdmin = activeChannel?.admins?.includes(currentUser?._id);

  // Build a userId→status lookup from the live `users` store (kept fresh by socket events)
  const statusMap = new Map(users.map(u => [u._id, u.status]));

  const memberList = activeChannel?.members || [];

  // Enrich each member with live status from the store
  const members = memberList.map(u => ({
    ...u,
    status: statusMap.get(u._id) || u.status || 'offline',
    isAdmin: activeChannel?.admins?.includes(u._id)
  }));

  const grouped = {
    online:  members.filter(u => u.status === 'online'),
    away:    members.filter(u => u.status === 'away'),
    busy:    members.filter(u => u.status === 'busy'),
    offline: members.filter(u => !['online','away','busy'].includes(u.status))
  };

  const Section = ({ label, list }) => list.length === 0 ? null : (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{label} — {list.length}</div>
      {list.map(u => (
        <div key={u._id} style={styles.member}>
          <div style={styles.avatarWrap}>
            <div style={styles.avatar}>{getInitials(u.name)}</div>
            <span style={{ ...styles.dot, background: statusConfig[u.status || 'offline']?.color }} />
          </div>
          <div style={styles.info}>
            <div style={styles.name}>{u.name}</div>
            <div style={styles.role}>{u.isAdmin ? 'Admin' : 'Member'} · {u.email}</div>
          </div>
          {isCurrentUserAdmin && u._id !== currentUser?._id && (
            <div style={styles.actions}>
              {u.isAdmin ? (
                <button onClick={() => demoteMember(activeChannel._id, u._id)} title="Demote to Member" style={styles.actionBtn}>↓</button>
              ) : (
                <button onClick={() => promoteMember(activeChannel._id, u._id)} title="Promote to Admin" style={styles.actionBtn}>↑</button>
              )}
              <button onClick={() => removeMember(activeChannel._id, u._id)} title="Remove Member" style={{ ...styles.actionBtn, color: '#ef4444' }}>×</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>👥 Members</span>
        <span style={styles.count}>{members.length} total</span>
      </div>
      <div style={styles.list}>
        <Section label="Online"  list={grouped.online} />
        <Section label="Away"    list={grouped.away} />
        <Section label="Busy"    list={grouped.busy} />
        <Section label="Offline" list={grouped.offline} />
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
  count: { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  list: { flex: 1, overflowY: 'auto', padding: 12 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 },
  member: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderRadius: 6 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'var(--accent)'
  },
  dot: {
    position: 'absolute', bottom: 0, right: 0, width: 9, height: 9,
    borderRadius: '50%', border: '2px solid var(--bg-base)'
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  role: { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actions: { display: 'flex', gap: 4 },
  actionBtn: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 6px', fontSize: 11, fontWeight: 600 }
};
