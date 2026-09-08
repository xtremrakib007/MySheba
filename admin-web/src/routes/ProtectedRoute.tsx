import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../layouts/AppShell';

export default function ProtectedRoute() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}
