import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AuthPage from './pages/AuthPage';
import WorkspacePage from './pages/WorkspacePage';
import JoinInvitePage from './pages/JoinInvitePage';
import './index.css';

export default function App() {
  useEffect(() => {
    const theme = localStorage.getItem('nexus_theme') || 'light';
    if (theme === 'dark') document.documentElement.classList.add('theme-dark');
    else document.documentElement.classList.remove('theme-dark');
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/invite/:inviteCode" element={
          <ProtectedRoute><JoinInvitePage /></ProtectedRoute>
        } />
        <Route path="/" element={
          <ProtectedRoute><WorkspacePage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
