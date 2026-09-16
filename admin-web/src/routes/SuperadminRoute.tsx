import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Nested under ProtectedRoute, so `profile` is already guaranteed to
// exist here. This adds the extra role check for routes whose backend
// data/control surface is superadmin-only (Point Top-Up, Device Sessions,
// Audit, Tool Access, Role Permissions and System Health).
// Governance and Activity Center are also defended in ProtectedRoute
// because their current App.tsx route declarations sit outside this group.
export default function SuperadminRoute() {
  const { profile } = useAuth();

  if (profile?.role !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
