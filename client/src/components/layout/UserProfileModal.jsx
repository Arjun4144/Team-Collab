import React from 'react';
import { getInitials } from '../../utils/helpers';

export default function UserProfileModal({ isOpen, onClose, user }) {
  if (!isOpen || !user) return null;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        
        <div style={styles.profileBody}>
          <div style={styles.avatarWrapper}>
            {user.avatar?.url ? (
              <img src={user.avatar.url} alt="Avatar" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarPlaceholder}>{getInitials(user.name)}</div>
            )}
          </div>

          <h2 style={styles.userName}>{user.name}</h2>
          <div style={styles.email}>{user.email}</div>
          
          <div style={styles.divider} />
          
          <div style={styles.bioSection}>
            <h3 style={styles.sectionLabel}>Bio</h3>
            <p style={styles.bioText}>
              {user.bio || "No bio provided."}
            </p>
          </div>
          
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Role</span>
              <span style={styles.infoValue}>{user.role || 'Member'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Status</span>
              <span style={{ ...styles.infoValue, color: user.status === 'online' ? '#10b981' : 'var(--text-muted)' }}>
                {user.status || 'Offline'}
              </span>
            </div>
          </div>
        </div>
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
    borderRadius: 20,
    width: 380,
    maxWidth: '90%',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    border: '1px solid var(--border-strong)',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 16px 0',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 28,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  profileBody: {
    padding: '0 32px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    overflow: 'hidden',
    marginBottom: 20,
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
    fontSize: 40,
    fontWeight: 700,
    color: 'var(--accent)',
  },
  userName: {
    margin: '0 0 4px 0',
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  email: {
    fontSize: 14,
    color: 'var(--text-muted)',
    marginBottom: 24,
  },
  divider: {
    width: '100%',
    height: 1,
    background: 'var(--border)',
    marginBottom: 24,
  },
  bioSection: {
    width: '100%',
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    margin: 0,
  },
  infoGrid: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    padding: 16,
    background: 'var(--bg-elevated)',
    borderRadius: 12,
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    textTransform: 'capitalize',
  },
};
