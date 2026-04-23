import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AuthPage from './pages/AuthPage';
import WorkspacePage from './pages/WorkspacePage';
import JoinInvitePage from './pages/JoinInvitePage';
import './index.css';

export default function App() {
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
