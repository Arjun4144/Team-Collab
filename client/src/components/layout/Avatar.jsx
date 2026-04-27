import React, { useState } from 'react';
import { getInitials } from '../../utils/helpers';

export default function Avatar({ user, size = 32, fontSize = 11, style = {} }) {
  const [error, setError] = useState(false);
  if (!user) return null;

  const initials = getInitials(user.name);
  let avatarUrl = user.avatar?.url || user.avatar; 
  
  // Ensure avatarUrl is a string and not an object or empty
  if (typeof avatarUrl !== 'string' || !avatarUrl.trim()) {
    avatarUrl = null;
  }

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
      {(avatarUrl && !error) ? (
        <img 
          src={avatarUrl} 
          alt={user.name} 
          onError={() => setError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        initials
      )}
    </div>
  );
}
