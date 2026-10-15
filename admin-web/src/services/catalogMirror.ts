// The IIMMPACT catalogue as the app reads it: the server's copy in Firestore
// (iimmpactCatalogMirror/MY, split into chunks - see
// src/firebase/iimmpactCatalogStore.js). Used for product pickers.
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface CatalogProduct { code: string; name: string; category: string }
export interface ProductGroup { label: string; items: { code: string; name: string }[] }

let cached: Promise<any> | null = null;

/** The whole catalogue (products and IIMMPACT's group/category tree). */
export function loadCatalog(): Promise<any> {
  if (!cached) {
    cached = (async () => {
      const meta = await getDoc(doc(db, 'iimmpactCatalogMirror', 'MY'));
      const m = meta.exists() ? meta.data() : null;
      const count = Number(m?.chunkCount || 0);
      if (!m || !count || !m.generation) return {};
      const parts = await Promise.all(Array.from({ length: count }, (_, i) => getDoc(doc(db, 'iimmpactCatalogMirror', 'MY', 'chunks', `${m.generation}_${i}`))));
      if (parts.some((p) => !p.exists())) return {};
      return JSON.parse(parts.map((p) => String(p.data()?.data || '')).join(''));
    })().catch((err) => { cached = null; throw err; });
  }
  return cached;
}

/**
 * Every product grouped as IIMMPACT files them ("Mobile · Mobile Prepaid").
 * The same rules as the app's src/utils/commissionProducts.js: inactive
 * products only when they carry a commission, uncategorised under Other.
 */
export function commissionProductGroups(catalog: any, savedCodes: string[] = [], filter = ''): ProductGroup[] {
  const byCode = new Map<string, any>();
  for (const p of Object.values<any>(catalog?.products || {})) if (p && p.code) byCode.set(String(p.code), p);
  const saved = new Set(savedCodes.map(String));
  const placed = new Set<string>();
  const groups: ProductGroup[] = [];
  const q = filter.trim().toLowerCase();
  const matches = (item: { code: string; name: string }, label: string) => !q || [item.name, item.code, label].some((v) => v.toLowerCase().includes(q));
  const add = (label: string, codes: unknown[]) => {
    const items: { code: string; name: string }[] = [];
    for (const raw of codes) {
      const code = String(raw);
      const p = byCode.get(code);
      if (placed.has(code) || (!p && !saved.has(code))) continue;
      if (p && p.is_active === false && !saved.has(code)) continue;
      const item = { code, name: String(p?.name || code) };
      placed.add(code);
      if (matches(item, label)) items.push(item);
    }
    if (items.length) groups.push({ label, items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  };
  for (const g of catalog?.tree?.groups || []) {
    for (const c of g?.categories || []) add([g?.name, c?.name].filter(Boolean).join(' · ') || 'Other', Array.isArray(c?.product_codes) ? c.product_codes : []);
  }
  add('Other', [...byCode.keys()]);
  add('Not in catalogue', [...saved]);
  return groups;
}
