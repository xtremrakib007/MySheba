import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess, landingPathFor } from '../routes/navConfig';
import AppShell from '../layouts/AppShell';

// Every screen is gated by navConfig's PATH_ACCESS against the signed-in
// person's effective capabilities (role defaults + their overrides), so
// someone who opens a URL they may not use is sent to their own landing page
// instead of a screen that would fail on permission-denied reads. Cloud
// Functions and firestore.rules enforce the same model server-side.
export default function ProtectedRoute() {
  const { profile, loading, access, accessLoading } = useAuth();
  const location = useLocation();

  // Wait for capabilities too, or a deep link would bounce before they load.
  if (loading || (profile && accessLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccess(location.pathname, access)) {
    const landing = landingPathFor(access);
    // Never redirect to the page we are already refusing.
    return landing === location.pathname ? <AppShell /> : <Navigate to={landing} replace />;
  }

  return <AppShell />;
}
