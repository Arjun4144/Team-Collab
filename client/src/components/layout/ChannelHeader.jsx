import React, { useState, useEffect, useRef } from 'react';
import useStore from '../../store/useStore';

export default function ChannelHeader() {
  const { activeChannel, setRightPanel, rightPanel, users, user, generateInviteLink, deleteChannel, renameChannel, showToast } = useStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && showDeleteModal && !isDeleting) {
        setShowDeleteModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showDeleteModal, isDeleting]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMenu && menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  if (!activeChannel) return null;

  const isAdmin = activeChannel.admins?.includes(user?._id);

  // Build a userId→status lookup from the live `users` store
  const statusMap = new Map(users.map(u => [u._id, u.status]));
  
  const memberList = activeChannel.members || [];
  const totalMembers = memberList.length;
  const onlineMembers = memberList.filter(u => statusMap.get(u?._id || u) === 'online').length;

  const handleInvite = async () => {
    try {
      const { inviteLink } = await generateInviteLink(activeChannel._id);
      const fullUrl = `${window.location.origin}${inviteLink}`;
      await navigator.clipboard.writeText(fullUrl);
      showToast('Invite link copied to clipboard!');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to generate invite link.');
    }
  };

  const handleRename = async () => {
    if (!renameInput.trim() || renameInput === activeChannel.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await renameChannel(activeChannel._id, renameInput.trim(), activeChannel.description);
      showToast('Channel renamed successfully');
      setIsRenaming(false);
    } catch (err) {
      showToast('Failed to rename channel.');
    }
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteChannel(activeChannel._id);
      showToast('Channel deleted successfully');
      setShowDeleteModal(false);
    } catch (err) {
      showToast('Failed to delete channel.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <span style={styles.hash}>🔒</span>
        {isRenaming ? (
          <div style={styles.renameForm}>
            <input 
              autoFocus
              style={styles.renameInput}
              value={renameInput}
              onChange={e => setRenameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
            />
            <button 
              onClick={handleRename} 
              style={{ ...styles.renameSaveBtn, opacity: (!renameInput.trim() || renameInput === activeChannel.name) ? 0.5 : 1 }}
              disabled={!renameInput.trim() || renameInput === activeChannel.name}
            >Save</button>
            <button onClick={() => setIsRenaming(false)} style={styles.renameCancelBtn}>Cancel</button>
          </div>
        ) : (
          <>
            <span style={styles.name}>{activeChannel.name}</span>
            {isAdmin && (
              <div style={{ position: 'relative' }} ref={menuRef}>
                <button onClick={() => setShowMenu(m => !m)} style={styles.menuDotsBtn}>...</button>
                {showMenu && (
                  <div style={styles.dropdown}>
                    <button onClick={() => { setShowMenu(false); handleInvite(); }} style={styles.dropdownBtn}>📋 Invite Link</button>
                    <button onClick={() => { setShowMenu(false); setRenameInput(activeChannel.name); setIsRenaming(true); }} style={styles.dropdownBtn}>✏️ Rename Channel</button>
                    <button onClick={() => { setShowMenu(false); setShowDeleteModal(true); }} style={{ ...styles.dropdownBtn, color: '#ef4444' }}>🗑️ Delete Channel</button>
                  </div>
                )}
              </div>
            )}
            {activeChannel.description && (
              <>
                <span style={styles.divider}>|</span>
                <span style={styles.desc}>{activeChannel.description}</span>
              </>
            )}
          </>
        )}
      </div>
      <div style={styles.actions}>
        <span style={styles.memberCount}>
          👥 {totalMembers} members · <span style={{ color: '#10b981' }}>●</span> {onlineMembers} online
        </span>
        {[
          { id: 'tasks',     label: '⚡ Tasks' },
          { id: 'decisions', label: '✅ Decisions' },
          { id: 'members',   label: '👥 Members' },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setRightPanel(id)}
            style={{ ...styles.btn, ...(rightPanel === id ? styles.btnActive : {}) }}>
            {label}
          </button>
        ))}
      </div>

      {/* Custom Delete Modal */}
      {showDeleteModal && (
        <div style={styles.modalOverlay} onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Delete Channel</h3>
            <p style={styles.modalDesc}>
              Are you sure you want to delete <strong>#{activeChannel.name}</strong>? This action is irreversible and all messages, tasks, and decisions will be permanently lost.
            </p>
            <div style={styles.modalActions}>
              <button 
                onClick={() => setShowDeleteModal(false)} 
                style={{ ...styles.modalCancelBtn, opacity: isDeleting ? 0.5 : 1 }}
                disabled={isDeleting}
              >Cancel</button>
              <button 
                onClick={confirmDelete} 
                style={{ ...styles.modalDeleteBtn, opacity: isDeleting ? 0.5 : 1 }}
                disabled={isDeleting}
              >{isDeleting ? 'Deleting...' : 'Delete Channel'}</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

const styles = {
  header: {
    height: 'var(--header-height)', padding: '0 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0
  },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  hash: { fontSize: 16, color: 'var(--text-muted)' },
  name: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' },
  divider: { color: 'var(--border-strong)', margin: '0 4px' },
  desc: { fontSize: 13, color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actions: { display: 'flex', alignItems: 'center', gap: 6 },
  memberCount: { fontSize: 12, color: 'var(--text-muted)', marginRight: 8 },
  btn: {
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)',
    cursor: 'pointer', transition: 'all 0.15s'
  },
  btnActive: { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--accent)' },
  menuDotsBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center', height: 20,
    lineHeight: '10px', paddingBottom: 6
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 100, minWidth: 160,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  },
  dropdownBtn: {
    display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
    padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
    borderRadius: 4, transition: 'background 0.1s'
  },
  renameForm: { display: 'flex', gap: 8, alignItems: 'center' },
  renameInput: {
    background: 'var(--bg-base)', border: '1px solid var(--accent)',
    borderRadius: 6, padding: '4px 8px', fontSize: 15, color: 'var(--text-primary)',
    outline: 'none', width: 200, fontFamily: 'var(--font-display)', fontWeight: 600
  },
  renameSaveBtn: {
    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4,
    padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.2s'
  },
  renameCancelBtn: {
    background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', 
    borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, backdropFilter: 'blur(4px)'
  },
  modalContent: {
    background: 'var(--bg-surface)', padding: 24, borderRadius: 12, width: 400, maxWidth: '90%',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid var(--border-strong)'
  },
  modalTitle: { margin: '0 0 12px 0', fontSize: 18, color: 'var(--text-primary)' },
  modalDesc: { margin: '0 0 24px 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 },
  modalActions: { display: 'flex', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: {
    padding: '8px 16px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, transition: 'opacity 0.2s'
  },
  modalDeleteBtn: {
    padding: '8px 16px', borderRadius: 6, background: '#ef4444', color: '#fff',
    border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'opacity 0.2s'
  }
};
