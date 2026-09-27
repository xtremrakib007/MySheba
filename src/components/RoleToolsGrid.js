import React from 'react';
import { useApp } from '../context/AppContext';
import FeatureGrid from './FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';
import * as gridManagementService from '../firebase/gridManagementService';

const DEALER_DASHBOARD = [
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'processing', icon: '🔄', bg: '#E3F2FD', name: 'Processing' },
  { key: 'completed', icon: '✅', bg: '#E8F5E9', name: 'Completed' },
  { key: 'topup', icon: '💰', bg: '#F3E5F5', name: 'Top-Up' },
];

const RESELLER_DASHBOARD = [
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'processing', icon: '➡️', bg: '#E3F2FD', name: 'Sent to Dealer' },
  { key: 'completed', icon: '✅', bg: '#E8F5E9', name: 'Completed' },
  { key: 'inquiries', icon: '📝', bg: '#E8EAF6', name: 'Inquiries' },
];

// Put the role's actual dashboard tabs on its homepage, then append only
// management tools explicitly granted by Feature Access. The same callbacks
// as the existing feature pages keep each tile connected to its real screen.
export default function RoleToolsGrid({ role }) {
  const {
    profile, setScreen, featureAccess, gridManagement, authUser,
    dealerTxs = [], resellerTxs = [], inquiries = [],
    setDealerTab, setDealerViewingSection,
    setResellerTab, setResellerViewingSection,
  } = useApp();

  if (!profile || profile.role !== role) return null;

  const dashboard = role === 'dealer' ? DEALER_DASHBOARD : RESELLER_DASHBOARD;
  const userId = authUser?.uid || profile.uid;
  const dashboardBadges = role === 'dealer'
    ? {
        pending: dealerTxs.filter((tx) => tx.status === 'pending' && !tx.rejectedBy?.[userId]).length || undefined,
        processing: dealerTxs.filter((tx) => tx.status === 'processing').length || undefined,
        completed: dealerTxs.filter((tx) => tx.status === 'completed').length || undefined,
      }
    : {
        pending: resellerTxs.filter((tx) => tx.status === 'pending' && !tx.rejectedBy?.[userId]).length || undefined,
        processing: resellerTxs.filter((tx) => tx.status === 'processing' && tx.claimedBy === userId).length || undefined,
        completed: resellerTxs.filter((tx) => tx.status === 'completed' && tx.claimedBy === userId).length || undefined,
        inquiries: inquiries.filter((item) => (item.status || 'new') === 'new').length || undefined,
      };

  const dashboardItems = dashboard
    .filter((item) => gridManagementService.isGridActive(
      gridManagement,
      item.key === 'processing' || item.key === 'completed' ? 'history' : item.key
    ))
    .map((item) => ({ ...item, badge: dashboardBadges[item.key] }));

  const managementItems = FEATURE_DEFS.filter((item) =>
    gridManagementService.isGridActive(gridManagement, item.key) &&
    canAccessFeature(featureAccess, item.key, profile.role, profile.uid)
  );

  const openDashboardItem = (key) => {
    if (role === 'dealer') {
      if (key === 'topup') {
        setScreen('topup');
        return;
      }
      setDealerTab(key);
      setDealerViewingSection(true);
      setScreen('dealerHome');
      return;
    }
    setResellerTab(key);
    setResellerViewingSection(true);
    setScreen('resellerHome');
  };

  return (
    <>
      {dashboardItems.length > 0 && (
        <FeatureGrid
          title={role === 'dealer' ? 'Dealer Dashboard' : 'Reseller Dashboard'}
          items={dashboardItems}
          onPress={openDashboardItem}
        />
      )}
      {managementItems.length > 0 && (
        <FeatureGrid
          title={role === 'dealer' ? 'Dealer Tools' : 'Reseller Tools'}
          items={managementItems}
          onPress={setScreen}
        />
      )}
    </>
  );
}
