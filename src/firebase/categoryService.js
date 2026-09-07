// Admin-editable category lists (Admin Panel > Category Management in the
// sitemap; PRD sections 5 & 8's Buy & Sell / Local Services category
// lists). Before this file existed, both lists were hardcoded string
// arrays (marketplaceService.CATEGORIES, serviceProviderService.CATEGORIES)
// that only a code change could touch.
//
// Storage: one doc per module at categories/{module} - `{ items: string[] }`
// - same one-doc-per-concern shape as settings/pricing and rates/current,
// so every screen that needs the list can subscribe with a single read.
// firestore.rules lets anyone signed in read (create/edit-listing pickers
// need it), but only admin can write.
//
// The doc doesn't exist until an admin makes their first edit - until
// then, subscribeCategories/ensureCategories fall back to DEFAULT_CATEGORIES
// below (which mirror the original hardcoded arrays exactly, so nothing
// changes for anyone until an admin actually opens Category Management).
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const COLLECTION = 'categories';

export const DEFAULT_CATEGORIES = {
  marketplace: ['Electronics', 'Mobile Phones', 'Computers', 'Vehicles', 'Furniture', 'Appliances', 'Clothing', 'Other'],
  services: ['Cleaning', 'Moving', 'Driver', 'Repair', 'Food Catering', 'Translation', 'Tuition', 'Freelance'],
};

// Human-readable labels for the Admin > Categories tab.
export const MODULE_LABELS = {
  marketplace: '🛒 Buy & Sell Categories',
  services: '🧰 Local Services Categories',
};

function categoryDoc(module) {
  return doc(db, COLLECTION, module);
}

/** Live category list for one module, falling back to the built-in
 * defaults until an admin has saved a custom list. */
export function subscribeCategories(module, callback, onError) {
  return onSnapshot(
    categoryDoc(module),
    (snap) => {
      const items = snap.exists() ? snap.data().items : null;
      callback(Array.isArray(items) && items.length > 0 ? items : DEFAULT_CATEGORIES[module] || []);
    },
    onError
  );
}

/** One-off read, same fallback as subscribeCategories - used by
 * add/removeCategory to seed the doc on first edit. */
async function getCurrentItems(module) {
  const snap = await getDoc(categoryDoc(module));
  const items = snap.exists() ? snap.data().items : null;
  return Array.isArray(items) && items.length > 0 ? items : [...(DEFAULT_CATEGORIES[module] || [])];
}

/** Admin-only (enforced by firestore.rules). Appends a new category,
 * case-insensitively deduped, trimmed. */
export async function addCategory(module, name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Enter a category name.');
  const items = await getCurrentItems(module);
  if (items.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    throw new Error('That category already exists.');
  }
  const next = [...items, clean];
  await setDoc(categoryDoc(module), { items: next, updatedAt: serverTimestamp() });
  return next;
}

/** Admin-only. Existing listings/providers keep whatever category string
 * they already have (it's just plain text on their own doc, same
 * snapshot-not-live tradeoff as sellerName/sellerVerified elsewhere in
 * this app) - removing it here only takes it out of the picker for new
 * listings going forward. */
export async function removeCategory(module, name) {
  const items = await getCurrentItems(module);
  const next = items.filter((c) => c !== name);
  await setDoc(categoryDoc(module), { items: next, updatedAt: serverTimestamp() });
  return next;
}
