import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

const fields: ConfigField[] = [
  {
    key: 'moduleKey',
    label: 'Module',
    type: 'select',
    options: [
      'mobileBanking',
      'recharge',
      'remittance',
      'travel',
      'ticketReseller',
    ],
  },
  { key: 'planName', label: 'Plan name', type: 'text', placeholder: 'e.g. Free, Pro' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function ModuleSubscriptionsPage() {
  return (
    <ConfigListPage
      collectionName="moduleSubscriptions"
      title="Module Subscriptions"
      description="Which app modules are on a paid plan and their price. This is the global on/off switch for a module — for per-customer overrides see Feature Access."
      fields={fields}
    />
  );
}
