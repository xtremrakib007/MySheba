// Admin-managed billers for Bill Payment. The app ships with a default list
// (src/data/billers.js) so the service works before anyone touches the admin
// panel; rows in the `billers` collection add to it, and a row whose id
// matches a default one overrides that default - which is how a biller gets
// renamed or switched off without an app update.
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from './config';
import { DEFAULT_BILLERS } from '../data/billers';

const COLLECTION = 'billers';

function mapBiller(d) {
  const data = d.data();
  return {
    id: data.billerId || d.id,
    country: String(data.country || '').toUpperCase(),
    name: data.name || '(unnamed biller)',
    category: data.category || 'other',
    accountLabel: data.accountLabel || 'Account number',
    active: data.active !== false,
    order: Number(data.order) || 0,
  };
}

/**
 * Live biller list: the defaults with any admin rows merged over the top.
 * Falls back to the defaults alone if the collection is empty or unreadable,
 * so Bill Payment never ends up with nothing to show.
 */
export function subscribeBillers(callback, onError) {
  return onSnapshot(
    query(collection(db, COLLECTION)),
    (snap) => {
      const overrides = snap.docs.map(mapBiller);
      const byId = new Map(DEFAULT_BILLERS.map((b) => [b.id, b]));
      overrides.forEach((b) => byId.set(b.id, { ...byId.get(b.id), ...b }));
      const merged = Array.from(byId.values())
        .filter((b) => b.active !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
      callback(merged);
    },
    (err) => {
      callback([...DEFAULT_BILLERS]);
      if (onError) onError(err);
    }
  );
}
