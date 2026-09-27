import React from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import FeatureGrid from './FeatureGrid';

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
  const { setScreen, gridManagement } = useApp();
  const { colors } = useTheme();
  const items = ITEMS.filter((item) => gridManagement?.[item.key] !== false);
  if (!items.length) return null;
  return <FeatureGrid title="Account & Tools" items={items} onPress={setScreen} />;
}
