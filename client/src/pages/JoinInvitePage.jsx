import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';

export default function JoinInvitePage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { token, joinChannelByInvite, setActiveChannel, fetchChannels } = useStore();
  const [status, setStatus] = useState('joining');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      // Store the invite code so we can redirect after login
      sessionStorage.setItem('pendingInvite', inviteCode);
      navigate('/login');
      return;
    }

    const join = async () => {
      try {
        const channel = await joinChannelByInvite(inviteCode);
        await fetchChannels();
        setActiveChannel(channel);
        setStatus('success');
        setTimeout(() => navigate('/'), 1500);
      } catch (err) {
        setError(err.response?.data?.error || 'Invalid or expired invite link');
        setStatus('error');
      }
    };
    join();
  }, [inviteCode, token]);

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.logo}>N</div>
        {status === 'joining' && (
          <>
            <h2 style={styles.title}>Joining channel…</h2>
            <p style={styles.sub}>Please wait while we add you to the channel.</p>
            <div style={styles.spinner} />
          </>
        )}
        {status === 'success' && (
          <>
            <h2 style={styles.title}>✅ You're in!</h2>
            <p style={styles.sub}>Redirecting to your workspace…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h2 style={styles.titleError}>⚠ Unable to join</h2>
            <p style={styles.sub}>{error}</p>
            <button onClick={() => navigate('/')} style={styles.btn}>Go to Workspace</button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  root: {
    height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-void)'
  },
  card: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '48px 40px', textAlign: 'center', maxWidth: 400, width: '100%'
  },
  logo: {
    width: 56, height: 56, borderRadius: 14, background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
    margin: '0 auto 24px'
  },
  title: { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  titleError: { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: '#fca5a5', marginBottom: 8 },
  sub: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 },
  btn: {
    padding: '10px 24px', background: 'var(--accent)', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-display)'
  },
  spinner: {
    width: 32, height: 32, border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', margin: '0 auto'
  }
};
