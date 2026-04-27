import React, { useState } from 'react';
import useStore from '../../store/useStore';
import { statusConfig } from '../../utils/helpers';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';

export default function MembersPanel({ type = 'workspace' }) {
  const { activeWorkspace, activeChannel, users, workspaceMembers, user: currentUser, removeMember, promoteMember, demoteMember, profileUser, setProfileUser } = useStore();

  const currentUserId = currentUser?._id;
  const creatorId = typeof activeWorkspace?.createdBy === 'object' ? activeWorkspace?.createdBy?._id : activeWorkspace?.createdBy;
  const isCurrentUserOwner = creatorId?.toString() === currentUserId?.toString();
  const isCurrentUserAdmin = isCurrentUserOwner || activeWorkspace?.admins?.some(a => (a._id || a) === currentUserId) || activeChannel?.admins?.some(a => (a._id || a) === currentUserId);

  const memberList = type === 'all' ? users : workspaceMembers;
  
  // Build a userId→status lookup from both lists
  const statusMap = new Map([...users, ...workspaceMembers].map(u => [u._id, u.status]));

  const openProfile = (user) => {
    if (profileUser?._id === user._id) return;
    setProfileUser(user);
  };

  // Enrich each member with live status and workspace role
  const members = memberList.map(u => {
    const isOwner = creatorId?.toString() === u._id?.toString();
    const isAdmin = isOwner || activeWorkspace?.admins?.some(a => (a._id || a) === u._id);
    const wsRole = isOwner ? 'Owner' : (isAdmin ? 'Admin' : 'Member');
    
    const canAct = (() => {
      if (type === 'all') return false;
      if (u._id === currentUserId) return false;
      if (isOwner) return false;
      if (isCurrentUserOwner) return true;
      if (isCurrentUserAdmin && !isAdmin) return true;
      return false;
    })();

    return {
      ...u,
      status: statusMap.get(u._id) || u.status || 'offline',
      wsRole,
      canAct
    };
  });

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
          <div style={styles.avatarWrap} onClick={() => openProfile(u)}>
            <Avatar user={u} size={32} style={{ cursor: 'pointer' }} />
            <span style={{ ...styles.dot, background: statusConfig[u.status || 'offline']?.color }} />
          </div>
          <div style={styles.info}>
            <div style={styles.name} onClick={() => openProfile(u)}>{u.name}</div>
            <div style={styles.role}>
              {type === 'all' ? u.email : `${u.wsRole} · ${u.email}`}
            </div>
          </div>
          {u.canAct && (
            <div style={styles.actions}>
              {u.wsRole === 'Admin' ? (
                <button 
                  onClick={(e) => { e.stopPropagation(); demoteMember(activeChannel._id, u._id); }} 
                  title="Demote to Member" style={styles.actionBtn}
                >↓</button>
              ) : (
                <button 
                  onClick={(e) => { e.stopPropagation(); promoteMember(activeChannel._id, u._id); }} 
                  title="Promote to Admin" style={styles.actionBtn}
                >↑</button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); removeMember(activeChannel._id, u._id); }} 
                title="Remove Member" style={{ ...styles.actionBtn, color: '#ef4444' }}
              >×</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>{type === 'all' ? '👥 People' : '👥 Workspace Members'}</span>
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
    flexShrink: 0, height: '100vh', overflow: 'hidden'
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
  member: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderRadius: 6, transition: 'background 0.15s' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  dot: {
    position: 'absolute', bottom: 0, right: 0, width: 9, height: 9,
    borderRadius: '50%', border: '2px solid var(--bg-base)'
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' },
  role: { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actions: { display: 'flex', gap: 4 },
  actionBtn: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 6px', fontSize: 11, fontWeight: 600 }
};
