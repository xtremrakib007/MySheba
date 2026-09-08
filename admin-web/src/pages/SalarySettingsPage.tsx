import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

const fields: ConfigField[] = [
  { key: 'role', label: 'Role', type: 'select', options: ['dealer', 'reseller'] },
  { key: 'tierName', label: 'Tier', type: 'text', placeholder: 'e.g. Tier 1' },
  { key: 'minVolume', label: 'Min monthly volume', type: 'number' },
  { key: 'salaryAmount', label: 'Salary / bonus amount', type: 'number' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function SalarySettingsPage() {
  return (
    <ConfigListPage
      collectionName="salaryTiers"
      title="Salary Settings"
      description="Volume-based salary/bonus tiers for dealers and resellers."
      fields={fields}
    />
  );
}
