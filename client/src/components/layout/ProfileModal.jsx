import React, { useState, useRef, useEffect } from 'react';
import useStore from '../../store/useStore';
import { getInitials } from '../../utils/helpers';
import api from '../../utils/api';

export default function ProfileModal({ isOpen, onClose, user: targetUser }) {
  const { user: currentUser, setUser, logout, showToast, activeWorkspace } = useStore();
  const isSelf = currentUser?._id === targetUser?._id;
  
  // Edit states (for self)
  const [name, setName] = useState(targetUser?.name || '');
  const [bio, setBio] = useState(targetUser?.bio || '');
  const [avatarPreview, setAvatarPreview] = useState(targetUser?.avatar?.url || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Sync state when user changes
  useEffect(() => {
    if (targetUser) {
      setName(targetUser.name || '');
      setBio(targetUser.bio || '');
      setAvatarPreview(targetUser.avatar?.url || '');
      setAvatarFile(null);
      setRemoveAvatar(false);
    }
  }, [targetUser]);

  if (!isOpen || !targetUser) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('File size must be less than 2MB');
        return;
      }
      setAvatarFile(file);
      setRemoveAvatar(false);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setAvatarFile(null);
    setAvatarPreview('');
    setRemoveAvatar(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return showToast('Name is required');

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('bio', bio.trim());
      formData.append('removeAvatar', removeAvatar);
      if (avatarFile) formData.append('avatar', avatarFile);

      const { data } = await api.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUser(data);
      showToast('Profile updated successfully');
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  // Role logic: Use workspace role if available
  const getWorkspaceRole = () => {
    if (!activeWorkspace) return null;
    const isMember = activeWorkspace.members?.some(m => (m._id || m) === targetUser._id);
    if (!isMember) return null;

    const isOwner = (activeWorkspace.createdBy?._id || activeWorkspace.createdBy) === targetUser._id;
    const isAdmin = isOwner || activeWorkspace.admins?.some(a => (a._id || a) === targetUser._id);
    return isOwner ? 'Owner' : (isAdmin ? 'Admin' : 'Member');
  };
  const wsRole = getWorkspaceRole();

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>

        <div style={styles.profileBody}>
          <div style={styles.avatarSection}>
            <div 
              className={isSelf ? "avatar-wrapper-hover" : ""}
              style={{ 
                ...styles.avatarWrapper, 
                cursor: isSelf ? 'pointer' : 'default'
              }} 
              onClick={() => isSelf && fileInputRef.current?.click()}
              title={isSelf ? "Change photo" : ""}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" style={styles.avatarImg} />
              ) : (
                <div style={styles.avatarPlaceholder}>{getInitials(name || targetUser.name)}</div>
              )}
              {isSelf && (
                <div className="avatar-hover-overlay" style={styles.avatarOverlay}>
                  <span style={{ fontSize: 18 }}>📷</span>
                </div>
              )}
            </div>

            {isSelf && (avatarPreview || targetUser.avatar) && (
              <button 
                type="button" 
                onClick={handleRemovePhoto}
                className="profile-remove-btn"
                style={styles.removeBtnSubtle}
              >
                Remove Photo
              </button>
            )}

            {isSelf && (
              <input 
                type="file" ref={fileInputRef} style={{ display: 'none' }} 
                accept="image/*" onChange={handleFileChange} 
              />
            )}
          </div>

          {isSelf ? (
            <form onSubmit={handleSave} style={{ width: '100%' }}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Display Name</label>
                <input 
                  style={styles.input} value={name} onChange={e => setName(e.target.value)} 
                  placeholder="Your name" required 
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Bio</label>
                <textarea 
                  style={{ ...styles.input, minHeight: 80, resize: 'vertical' }} 
                  value={bio} onChange={e => setBio(e.target.value)} 
                  placeholder="Tell others about yourself..." 
                />
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={logout} style={styles.logoutBtn}>Logout</button>
                <button type="submit" style={styles.saveBtn} disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h2 style={styles.userName}>{targetUser.name}</h2>
              <div style={styles.email}>{targetUser.email}</div>
              <div style={styles.divider} />
              <div style={styles.bioSection}>
                <h3 style={styles.sectionLabel}>Bio</h3>
                <p style={styles.bioText}>{targetUser.bio || "No bio provided."}</p>
              </div>
              <div style={styles.infoGrid}>
                {wsRole && (
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Role</span>
                    <span style={styles.infoValue}>{wsRole}</span>
                  </div>
                )}
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Status</span>
                  <span style={{ ...styles.infoValue, color: targetUser.status === 'online' ? '#10b981' : 'var(--text-muted)' }}>
                    {targetUser.status || 'Offline'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { background: 'var(--bg-surface)', borderRadius: 20, width: 400, maxWidth: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', border: '1px solid var(--border-strong)', overflow: 'hidden' },
  header: { padding: '16px 16px 0', display: 'flex', justifyContent: 'flex-end' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 28, cursor: 'pointer', lineHeight: 1, padding: 0 },
  profileBody: { padding: '0 32px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  avatarSection: { marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  avatarWrapper: { width: 110, height: 110, borderRadius: '50%', overflow: 'hidden', position: 'relative', background: 'var(--bg-elevated)', border: '4px solid var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarPlaceholder: { fontSize: 36, fontWeight: 700, color: 'var(--accent)' },
  avatarOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '4px 0', textAlign: 'center', opacity: 0, transition: 'opacity 0.2s' },
  userName: { margin: '0 0 4px 0', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
  email: { fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 },
  divider: { width: '100%', height: 1, background: 'var(--border)', marginBottom: 20 },
  bioSection: { width: '100%', marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  bioText: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 },
  infoGrid: { width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14, background: 'var(--bg-elevated)', borderRadius: 12 },
  infoItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  infoLabel: { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' },
  inputGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' },
  input: { width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text-primary)', outline: 'none' },
  modalActions: { display: 'flex', gap: 10, marginTop: 24 },
  logoutBtn: { flex: 1, padding: '10px', borderRadius: 8, background: 'none', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontWeight: 600 },
  saveBtn: { flex: 2, padding: '10px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 },
  actionLink: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 8px', borderRadius: 4, transition: 'background 0.2s' },
  removeBtnSubtle: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer', marginTop: 10, padding: '4px 8px', borderRadius: 4, transition: 'all 0.2s' }
};
