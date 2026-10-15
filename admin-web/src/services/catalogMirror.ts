// The IIMMPACT catalogue as the app reads it: the server's copy in Firestore
// (iimmpactCatalogMirror/MY, split into chunks - see
// src/firebase/iimmpactCatalogStore.js). Used for product pickers.
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface CatalogProduct { code: string; name: string; category: string }

let cached: Promise<CatalogProduct[]> | null = null;

export function loadCatalogProducts(): Promise<CatalogProduct[]> {
  if (!cached) {
    cached = (async () => {
      const meta = await getDoc(doc(db, 'iimmpactCatalogMirror', 'MY'));
      const m = meta.exists() ? meta.data() : null;
      const count = Number(m?.chunkCount || 0);
      if (!m || !count || !m.generation) return [];
      const parts = await Promise.all(Array.from({ length: count }, (_, i) => getDoc(doc(db, 'iimmpactCatalogMirror', 'MY', 'chunks', `${m.generation}_${i}`))));
      if (parts.some((p) => !p.exists())) return [];
      const catalog = JSON.parse(parts.map((p) => String(p.data()?.data || '')).join(''));
      return Object.values(catalog?.products || {})
        .filter((p: any) => p && p.code)
        .map((p: any) => ({ code: String(p.code), name: String(p.name || p.code), category: String(p.category || '') }));
    })().catch((err) => { cached = null; throw err; });
  }
  return cached;
}

/** Products whose name, code or category matches, names starting with the query first. */
export function searchCatalogProducts(products: CatalogProduct[], query: string, limit = 10): CatalogProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products
    .filter((p) => [p.name, p.code, p.category].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, limit);
}
