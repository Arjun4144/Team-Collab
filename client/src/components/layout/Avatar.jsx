import React from 'react';
import { getInitials } from '../../utils/helpers';

export default function Avatar({ user, size = 32, fontSize = 11, style = {} }) {
  if (!user) return null;

  const initials = getInitials(user.name);
  const avatarUrl = user.avatar?.url || user.avatar; // Handle both old string and new object format

  return (
    <div 
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSize,
        fontWeight: 700,
        color: 'var(--accent)',
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        ...style
      }}
    >
      {avatarUrl ? (
        <img 
          src={avatarUrl} 
          alt={user.name} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        initials
      )}
    </div>
  );
}
