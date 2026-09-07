import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

const fields: ConfigField[] = [
  { key: 'name', label: 'Method name', type: 'text', placeholder: 'e.g. bKash, Bank Transfer' },
  { key: 'type', label: 'Type', type: 'select', options: ['mobileWallet', 'bank', 'cash'] },
  { key: 'accountDetails', label: 'Account details', type: 'text' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function PaymentSettingsPage() {
  return (
    <ConfigListPage
      collectionName="paymentMethods"
      title="Payment Settings"
      description="Payout/payment channels offered to users and dealers."
      fields={fields}
    />
  );
}
