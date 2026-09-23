// Admin-editable category lists — real schema (confirmed against the
// mobile app's src/firebase/categoryService.js): one doc per module at
// categories/{module}, shape `{ items: string[] }`. This replaces the
// earlier assumption of a flat "categories" collection with one row per
// category, which doesn't match how the app actually reads/writes this
// data.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
    'Electronics',
    'Mobile Phones',
    'Computers',
    'Vehicles',
    'Furniture',
    'Appliances',
    'Clothing',
    'Other',
  ],
  services: [
    'Cleaning',
    'Moving',
    'Driver',
    'Repair',
    'Food Catering',
    'Translation',
    'Tuition',
    'Freelance',
  ],
};

export const MODULE_LABELS: Record<string, string> = {
  services: 'Local Services Categories',
};

function categoryDoc(module: string) {
  return doc(db, 'categories', module);
}

export async function fetchCategories(module: string): Promise<string[]> {
  const snap = await getDoc(categoryDoc(module));
  const items = snap.exists() ? (snap.data().items as string[] | undefined) : undefined;
  return Array.isArray(items) && items.length > 0 ? items : [...(DEFAULT_CATEGORIES[module] ?? [])];
}

export async function addCategory(module: string, name: string): Promise<string[]> {
  const clean = name.trim();
  if (!clean) throw new Error('Enter a category name.');
  const items = await fetchCategories(module);
  if (items.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    throw new Error('That category already exists.');
  }
  const next = [...items, clean];
  await setDoc(categoryDoc(module), { items: next, updatedAt: serverTimestamp() });
  return next;
}

export async function removeCategory(module: string, name: string): Promise<string[]> {
  const items = await fetchCategories(module);
  const next = items.filter((c) => c !== name);
  await setDoc(categoryDoc(module), { items: next, updatedAt: serverTimestamp() });
  return next;
}
