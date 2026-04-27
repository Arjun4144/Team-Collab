import React, { useState, useRef } from 'react';
import useStore from '../../store/useStore';
import { getInitials } from '../../utils/helpers';
import api from '../../utils/api';

export default function ProfileSettingsModal({ isOpen, onClose }) {
  const { user, setUser, showToast } = useStore();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar?.url || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('File size must be less than 2MB');
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Name is required');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('bio', bio.trim());
      if (avatarFile) {
        formData.append('avatar', avatarFile);
      }

      const { data } = await api.put('/users/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUser(data);
      // Also update in users list if it exists in store
      const { users, setUsers } = useStore.getState();
      if (users.length > 0) {
        setUsers(users.map(u => u._id === data._id ? data : u));
      }

      showToast('Profile updated successfully');
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Profile Settings</h2>
        
        <form onSubmit={handleSave}>
          <div style={styles.avatarSection}>
            <div style={styles.avatarWrapper} onClick={() => fileInputRef.current.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" style={styles.avatarImg} />
              ) : (
                <div style={styles.avatarPlaceholder}>{getInitials(name)}</div>
              )}
              <div style={styles.avatarOverlay}>Change</div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={handleFileChange} 
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Display Name</label>
            <input 
              style={styles.input} 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Your name"
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Bio</label>
            <textarea 
              style={{ ...styles.input, minHeight: 80, resize: 'vertical' }} 
              value={bio} 
              onChange={e => setBio(e.target.value)} 
              placeholder="Tell others about yourself..."
            />
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={loading}>
              Cancel
            </button>
            <button type="submit" style={styles.saveBtn} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  modalContent: {
    background: 'var(--bg-surface)',
    padding: 32,
    borderRadius: 16,
    width: 440,
    maxWidth: '90%',
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
    border: '1px solid var(--border-strong)',
  },
  modalTitle: {
    margin: '0 0 24px 0',
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  avatarSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'pointer',
    background: 'var(--bg-elevated)',
    border: '4px solid var(--accent-dim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarPlaceholder: {
    fontSize: 32,
    fontWeight: 700,
    color: 'var(--accent)',
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 0',
    textAlign: 'center',
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  // Add hover effect via JS or style tag
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    width: '100%',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 15,
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  modalActions: {
    display: 'flex',
    gap: 12,
    marginTop: 32,
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: 8,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'background 0.2s',
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'opacity 0.2s',
  },
};
