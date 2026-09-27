import React from 'react';
import { useApp } from '../context/AppContext';
import FeatureGrid from './FeatureGrid';
import * as gridManagementService from '../firebase/gridManagementService';

// Common shortcuts formerly available only from the navigation drawer.
// Keep these on every role's home screen so users do not need the sidebar
// to reach account, documents, reporting, or salary tools.
const ITEMS = [
  { key: 'profile', icon: '👤', bg: '#E3F2FD', name: 'Profile' },
  { key: 'myAccount', icon: '🪪', bg: '#E0F7FA', name: 'My Account' },
  { key: 'settings', icon: '⚙️', bg: '#EDE7F6', name: 'Settings' },
  { key: 'salaryDashboard', icon: '💵', bg: '#E8F5E9', name: 'Salary & OT' },
  { key: 'reports', icon: '📄', bg: '#FFF3E0', name: 'Reports' },
  { key: 'myDocuments', icon: '📁', bg: '#E0F7FA', name: 'My Documents' },
];

export default function AccountToolsGrid() {
  const { setScreen, gridManagement, profile, can, openSalary, openMyDocuments } = useApp();
  const GRID_KEY_FOR = { salaryDashboard: 'salary' };
  const items = ITEMS.filter((item) => {
    if (!gridManagementService.isGridActive(gridManagement, GRID_KEY_FOR[item.key] || item.key)) return false;
    if (item.key === 'reports' && ['admin', 'superadmin', 'support', 'finance'].includes(profile?.role) && !can('reports')) return false;
    return true;
  });
  if (!items.length) return null;
  const openItem = (key) => {
    if (key === 'salaryDashboard') return openSalary();
    if (key === 'myDocuments') return openMyDocuments();
    return setScreen(key);
  };
  return <FeatureGrid title="Account & Tools" items={items} onPress={openItem} />;
}
