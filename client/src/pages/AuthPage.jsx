import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { initSocket } from '../utils/socket';
import useStore from '../store/useStore';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useStore();
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const email = form.email.trim();
      const password = form.password;
      const name = form.name.trim();

      if (mode === 'register') {
        if (!name) return setError('Name is required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Invalid email format');
      }

      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload  = mode === 'login'
        ? { email, password }
        : { ...form, email, name };

      const { data } = await api.post(endpoint, payload);
      setToken(data.token);
      setUser(data.user);
      initSocket(data.token);
      const pendingInvite = sessionStorage.getItem('pendingInvite');
      if (pendingInvite) {
        sessionStorage.removeItem('pendingInvite');
        navigate(`/invite/${pendingInvite}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(true); // Keep loading true during redirect
      setTimeout(() => setLoading(false), 500);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setForm({ name: '', email: '', password: '' });
  };

  const inp = (field) => ({
    value: form[field] || '',
    autoComplete: field === 'password' ? 'current-password' : 'email',
    onChange: (e) => {
      const val = e.target.value;
      setForm(f => ({ ...f, [field]: val }));
    }
  });

  return (
    <div style={styles.root}>
      <div style={styles.left}>
        <div style={styles.brand}>
          <div style={styles.logo}>N</div>
          <span style={styles.wordmark}>nexus</span>
        </div>
        <h1 style={styles.headline}>Professional communication,<br />built for clarity.</h1>
        <p style={styles.sub}>Structured messages. Permanent decisions. Zero noise.</p>
        <div style={styles.pills}>
          {['✅ Decision log', '⚡ Action tracking', '📢 Intent-based messaging', '🤫 Priority inbox'].map(t => (
            <span key={t} style={styles.pill}>{t}</span>
          ))}
        </div>
      </div>

      <div style={styles.right}>
        <form style={styles.card} onSubmit={handle}>
          <div style={styles.tabs}>
            {['login', 'register'].map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Full name</label>
              <input style={styles.input} placeholder="Jane Doe" required {...inp('name')} />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email address</label>
            <input style={styles.input} type="email" placeholder="you@company.com" required {...inp('email')} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input style={styles.input} type="password" placeholder="••••••••" required {...inp('password')} />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', height: '100vh', background: 'var(--bg-void)' },
  left: {
    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '64px 80px', borderRight: '1px solid var(--border)',
    background: 'linear-gradient(135deg, var(--bg-base) 0%, var(--bg-void) 100%)'
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 },
  logo: {
    width: 40, height: 40, borderRadius: 10,
    background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800
  },
  wordmark: { fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' },
  headline: {
    fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
    lineHeight: 1.2, color: 'var(--text-primary)', marginBottom: 16
  },
  sub: { color: 'var(--text-secondary)', fontSize: 16, marginBottom: 36 },
  pills: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  pill: {
    padding: '6px 14px', borderRadius: 'var(--radius-full)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', fontSize: 13
  },
  right: {
    width: 440, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 40, background: 'var(--bg-base)'
  },
  card: {
    width: '100%', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
    padding: 32
  },
  tabs: { display: 'flex', gap: 4, marginBottom: 28, background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', padding: 4 },
  tab: {
    flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 500,
    color: 'var(--text-muted)', background: 'none', transition: 'all 0.15s'
  },
  tabActive: { background: 'var(--bg-elevated)', color: 'var(--text-primary)' },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 },
  input: {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14,
    color: 'var(--text-primary)', transition: 'border-color 0.15s'
  },
  error: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5', borderRadius: 'var(--radius-md)', padding: '10px 14px',
    fontSize: 13, marginBottom: 16
  },
  btn: {
    width: '100%', padding: '12px 0', background: 'var(--accent)',
    color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600,
    fontFamily: 'var(--font-display)', transition: 'opacity 0.15s', marginTop: 8,
    cursor: 'pointer'
  }
};
