import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess, landingPathFor } from '../routes/navConfig';
import AppShell from '../layouts/AppShell';
import AccessRestrictedPage from '../pages/AccessRestrictedPage';
import {
  canAccessPortal,
  getCurrentPortal,
  isKnownProductionPortal,
  landingPathForPortal,
  portalAllowsPath,
  portalEnforcementEnabled,
} from '../services/portalConfig';

// Capability checks remain the first authorization layer. Portal checks add a
// hostname/department boundary in the UI, but Cloud Functions and Firestore
// rules remain authoritative for data and mutations.
export default function ProtectedRoute() {
  const { profile, loading, access, accessLoading } = useAuth();
  const location = useLocation();
  const portal = getCurrentPortal();
  const enforcePortal = portalEnforcementEnabled();

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

  const knownHost = isKnownProductionPortal();
  const portalAllowed = knownHost && canAccessPortal(portal, access);
  const pathAllowedInPortal = portalAllowsPath(portal, location.pathname);

  // Shadow mode deliberately keeps existing behaviour, but records a minimal
  // mismatch signal without customer data, tokens or permission internals.
  useEffect(() => {
    if (enforcePortal || (knownHost && portalAllowed && pathAllowedInPortal)) return;
    console.warn('Portal access mismatch (shadow mode)', {
      portal,
      path: location.pathname,
      role: access.role,
      knownHost,
    });
  }, [access.role, enforcePortal, knownHost, location.pathname, pathAllowedInPortal, portal, portalAllowed]);

  if (enforcePortal && (!portalAllowed || !pathAllowedInPortal)) {
    return <AccessRestrictedPage access={access} portal={portal} />;
  }

  if (!canAccess(location.pathname, access)) {
    const landing = enforcePortal ? landingPathForPortal(portal, access) : landingPathFor(access);
    if (landing === location.pathname) {
      return enforcePortal
        ? <AccessRestrictedPage access={access} portal={portal} />
        : <AppShell />;
    }
    return <Navigate to={landing} replace />;
  }

  return <AppShell />;
}
