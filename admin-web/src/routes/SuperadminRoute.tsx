import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Nested under ProtectedRoute, so `profile` is already guaranteed to
// exist here — this only adds the extra role check for the
// Superadmin-only screens (Point Top-Up, Device Sessions). A plain
// admin hitting these URLs directly (the sidebar already hides them)
// gets bounced to the dashboard rather than seeing a broken page.
export default function SuperadminRoute() {
  const { profile } = useAuth();

  if (profile?.role !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
