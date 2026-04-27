import React, { useEffect, useRef, useState } from 'react';
import useStore from '../../store/useStore';

export default function ConfirmationModal() {
  const { confirmModal, setConfirmModal } = useStore();
  const cancelRef = useRef(null);
  const [hoverBtn, setHoverBtn] = useState(null); // 'cancel' | 'confirm'

  useEffect(() => {
    if (!confirmModal) return;
    
    // Focus cancel button on open
    setTimeout(() => cancelRef.current?.focus(), 50);

    const handleEsc = (e) => {
      if (e.key === 'Escape') setConfirmModal(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [confirmModal, setConfirmModal]);

  if (!confirmModal) return null;

  const { title, message, onConfirm, confirmText, type = 'primary' } = confirmModal;

  const handleConfirm = (e) => {
    e.stopPropagation();
    onConfirm();
    setConfirmModal(null);
  };

  return (
    <div style={styles.overlay} onClick={() => setConfirmModal(null)}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
        </div>
        <div style={styles.body}>
          <div style={styles.message}>{message}</div>
        </div>
        <div style={styles.actions}>
          <button 
            ref={cancelRef}
            style={{ 
              ...styles.cancelBtn, 
              background: hoverBtn === 'cancel' ? 'var(--bg-hover)' : 'var(--bg-elevated)' 
            }} 
            onMouseEnter={() => setHoverBtn('cancel')}
            onMouseLeave={() => setHoverBtn(null)}
            onClick={() => setConfirmModal(null)}
          >
            Cancel
          </button>
          <button 
            style={{ 
              ...styles.confirmBtn, 
              background: type === 'danger' 
                ? (hoverBtn === 'confirm' ? '#dc2626' : '#ef4444')
                : (hoverBtn === 'confirm' ? 'var(--accent-strong)' : 'var(--accent)')
            }} 
            onMouseEnter={() => setHoverBtn('confirm')}
            onMouseLeave={() => setHoverBtn(null)}
            onClick={handleConfirm}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000 },
  modal: { background: 'var(--bg-surface)', borderRadius: 20, width: 420, maxWidth: '90%', padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column' },
  header: { marginBottom: 12 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  body: { marginBottom: 32 },
  message: { fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.2s', outline: 'none' },
  confirmBtn: { padding: '10px 20px', borderRadius: 10, border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.2s', outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }
};
