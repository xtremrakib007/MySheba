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

export default function ProtectedRoute() {
  const { profile, loading, access, accessLoading } = useAuth();
  const location = useLocation();
  const portal = getCurrentPortal();
  const enforcePortal = portalEnforcementEnabled();
  const knownHost = isKnownProductionPortal();
  const portalAllowed = knownHost && canAccessPortal(portal, access);
  const pathAllowedInPortal = portalAllowsPath(portal, location.pathname);

  useEffect(() => {
    if (!profile || enforcePortal || (knownHost && portalAllowed && pathAllowedInPortal)) return;
    console.warn('Portal access mismatch (shadow mode)', {
      portal,
      path: location.pathname,
      role: access.role,
      knownHost,
    });
  }, [access.role, enforcePortal, knownHost, location.pathname, pathAllowedInPortal, portal, portalAllowed, profile]);

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
