import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

// The app ships with a default biller list (src/data/billers.js) so Bill
// Payment works before anyone touches this screen. Rows here are merged over
// those defaults: reuse a default's id to rename or switch one off, or use a
// new id to add a biller of your own.
const fields: ConfigField[] = [
  { key: 'billerId', label: 'ID', type: 'text', placeholder: 'e.g. my-tnb (reuse to override a default)' },
  { key: 'country', label: 'Country', type: 'select', options: ['MY', 'BD'] },
  { key: 'name', label: 'Biller', type: 'text', placeholder: 'e.g. Tenaga Nasional (TNB)' },
  {
    key: 'category',
    label: 'Category',
    type: 'select',
    options: ['electricity', 'water', 'gas', 'sewerage', 'internet', 'telco'],
  },
  { key: 'accountLabel', label: 'Account field label', type: 'text', placeholder: 'e.g. TNB account number' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function BillersPage() {
  return (
    <ConfigListPage
      collectionName="billers"
      title="Billers"
      description="Electricity, water, gas and telco billers customers can pay through Bill Payment. These merge with the list built into the app — reuse a built-in ID to rename or disable one."
      fields={fields}
    />
  );
}
