import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../layouts/AppShell';

// These screens read superadmin-scoped operational/governance data. Keep the
// route-level check here as defense-in-depth even if a route is accidentally
// moved outside the nested SuperadminRoute group in App.tsx.
const SUPERADMIN_ONLY_PATHS = new Set([
  '/activity-center',
  '/governance',
]);

export default function ProtectedRoute() {
  const { profile, loading } = useAuth();
  const location = useLocation();

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

  if (SUPERADMIN_ONLY_PATHS.has(location.pathname) && profile.role !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return <AppShell />;
}
