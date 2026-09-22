import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess, landingPathFor } from '../routes/navConfig';

// Second line of defence for the governance group. ProtectedRoute already
// checks the same map; this keeps the guarantee even if a route is moved out
// of that group by accident.
export default function SuperadminRoute() {
  const { access } = useAuth();
  const location = useLocation();

  if (!canAccess(location.pathname, access)) {
    return <Navigate to={landingPathFor(access)} replace />;
  }

  return <Outlet />;
}
