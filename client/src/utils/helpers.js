import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

export const formatTime = (date) => {
  const d = new Date(date);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, HH:mm');
};

export const formatRelative = (date) =>
  formatDistanceToNow(new Date(date), { addSuffix: true });

export const getInitials = (name = '') => {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const intentConfig = {
  discussion:   { label: 'Discussion',   icon: '💬', color: '#818cf8' },
  announcement: { label: 'Announcement', icon: '📢', color: '#fbbf24' },
  decision:     { label: 'Decision',     icon: '✅', color: '#34d399' },
  action:       { label: 'Action',       icon: '⚡', color: '#fb923c' },
  fyi:          { label: 'FYI',          icon: '📌', color: '#a78bfa' },
};

export const priorityConfig = {
  low:    { label: 'Low',    color: '#64748b' },
  normal: { label: 'Normal', color: '#6366f1' },
  high:   { label: 'High',   color: '#f59e0b' },
  urgent: { label: 'Urgent', color: '#ef4444' },
};

export const statusConfig = {
  online:  { label: 'Online',  color: '#10b981' },
  away:    { label: 'Away',    color: '#f59e0b' },
  busy:    { label: 'Busy',    color: '#ef4444' },
  offline: { label: 'Offline', color: '#4a607a' },
};
