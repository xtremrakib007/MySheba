import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

const fields: ConfigField[] = [
  { key: 'name', label: 'Category', type: 'text', placeholder: 'e.g. Mobile Banking' },
  { key: 'slug', label: 'Key', type: 'text', placeholder: 'e.g. mobile-banking' },
  { key: 'icon', label: 'Icon', type: 'text', placeholder: 'Emoji or icon name' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function CategoriesPage() {
  return (
    <ConfigListPage
      collectionName="categories"
      title="Categories"
      description="Service categories used to group services in the mobile app, in display order."
      fields={fields}
    />
  );
}
