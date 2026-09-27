import React from 'react';
import { useApp } from '../context/AppContext';
import FeatureGrid from './FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';
import * as gridManagementService from '../firebase/gridManagementService';

// Render role-granted tools directly on the role homepage. Keep the same
// role/feature-access and grid-management checks as the dedicated tools page.
export default function RoleToolsGrid({ role }) {
  const { profile, setScreen, featureAccess, gridManagement } = useApp();
  if (!profile || profile.role !== role) return null;
  const items = FEATURE_DEFS.filter((item) =>
    gridManagementService.isGridActive(gridManagement, item.key) &&
    canAccessFeature(featureAccess, item.key, profile.role, profile.uid)
  );
  if (!items.length) return null;
  const title = role === 'dealer' ? 'Dealer Tools' : 'Reseller Tools';
  return <FeatureGrid title={title} items={items} onPress={setScreen} />;
}
