import React from 'react';
import { Navigate } from 'react-router-dom';
import useStore from '../../store/useStore';

export default function ProtectedRoute({ children }) {
  const token = useStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}
