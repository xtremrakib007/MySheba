import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

const fields: ConfigField[] = [
  { key: 'serviceName', label: 'Service', type: 'text', placeholder: 'e.g. bKash Cash In' },
  { key: 'buyRate', label: 'Buy rate', type: 'number' },
  { key: 'sellRate', label: 'Sell rate', type: 'number' },
  { key: 'commission', label: 'Commission %', type: 'number' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function RatesPricingPage() {
  return (
    <ConfigListPage
      collectionName="rates"
      title="Rates & Pricing"
      description="Buy/sell rates and commission per service, applied across mobile banking and recharge."
      fields={fields}
    />
  );
}
