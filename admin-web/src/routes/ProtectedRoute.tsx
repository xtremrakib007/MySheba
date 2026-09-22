import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess, landingPathFor } from '../routes/navConfig';
import AppShell from '../layouts/AppShell';

// Every screen is gated by navConfig's PATH_ROLES, so a support agent or a
// finance user who types a URL they may not open is sent to their own landing
// page rather than a screen that would fail on permission-denied reads.
// Firestore rules enforce the same boundaries server-side.
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

  if (!canAccess(location.pathname, profile.role)) {
    return <Navigate to={landingPathFor(profile.role)} replace />;
  }

  return <AppShell />;
}
