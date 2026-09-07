import ConfigListPage from '../components/ConfigListPage';
import type { ConfigField } from '../services/configService';

const fields: ConfigField[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'imageUrl', label: 'Image URL', type: 'text', placeholder: 'https://…' },
  { key: 'linkUrl', label: 'Link URL', type: 'text', placeholder: 'https://… (optional)' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'active', label: 'Status', type: 'boolean' },
];

export default function BannersPage() {
  return (
    <ConfigListPage
      collectionName="banners"
      title="Banners"
      description="Home-screen banners shown in the mobile app, in display order. Paste an already-hosted image URL — this screen doesn't upload images."
      fields={fields}
    />
  );
}
