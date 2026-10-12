import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';
import * as apiProviderService from './apiProviderService';
import { IIMMPACT_CATALOG_CACHE_KEY } from '../components/iimmpactTiles';

// One copy of the catalogue for the whole app, read from MySheba - not from
// IIMMPACT.
//
// IIMMPACT's catalogue takes 10-15 seconds to fetch, and every page used to
// wait for it. Now, in order:
//
//   1. memory            - this session already has it: instant;
//   2. the phone's copy  - AsyncStorage, drawn at once on a cold start;
//   3. MySheba's copy    - iimmpactCatalogMirror/MY in Firestore, kept current
//                          by Cloud Functions (hourly, and on IIMMPACT's change
//                          webhook). Read in the background; a page that
//                          already has (1) or (2) never waits for it.
//
// Only when neither the phone nor Firestore has a copy - the very first run
// before the server has saved one - does it ask the server, which itself
// answers from its saved copy whenever it has one.
//
// Every screen goes through here, so the catalogue is loaded once and shared.
const RECHECK_MS = 10 * 60 * 1000;
const MIRROR = 'iimmpactCatalogMirror';

let memory = null;
let memoryHash = '';
let checkedAt = 0;
let inflight = null;
const listeners = new Set();

async function readSaved() {
  try {
    const saved = await AsyncStorage.getItem(IIMMPACT_CATALOG_CACHE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    if (parsed && typeof parsed === 'object' && parsed.catalog && typeof parsed.catalog === 'object') return parsed;
    // A copy saved before the hash was kept alongside it.
    return parsed && typeof parsed === 'object' ? { catalog: parsed, hash: '' } : null;
  } catch (_) {
    return null;
  }
}

function keep(catalog, hash) {
  memory = catalog;
  memoryHash = hash || '';
  listeners.forEach((listener) => listener(catalog));
  AsyncStorage.setItem(IIMMPACT_CATALOG_CACHE_KEY, JSON.stringify({ catalog, hash: memoryHash })).catch(() => {});
}

/**
 * MySheba's saved catalogue from Firestore. `knownHash` skips downloading the
 * chunks when the phone already has this version. Returns null when there is
 * no saved copy (or it cannot be read), `{ unchanged: true }` when it matches.
 */
async function readMirror(country = 'MY', knownHash = '') {
  const ref = doc(db, MIRROR, country);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const meta = snap.data() || {};
  const count = Number(meta.chunkCount || 0);
  if (!count || !meta.generation) return null;
  if (knownHash && meta.hash === knownHash) return { unchanged: true, hash: meta.hash };
  const parts = await Promise.all(Array.from({ length: count }, (_, i) => getDoc(doc(db, MIRROR, country, 'chunks', `${meta.generation}_${i}`))));
  if (parts.some((part) => !part.exists())) return null;
  const catalog = JSON.parse(parts.map((part) => String(part.data()?.data || '')).join(''));
  return { catalog, hash: String(meta.hash || '') };
}

/** The catalogue, as fast as it can be had. See the notes above. */
export function loadIimmpactCatalog({ force = false } = {}) {
  if (!force && memory && Date.now() - checkedAt < RECHECK_MS) return Promise.resolve(memory);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const mirrored = await readMirror('MY', force ? '' : memoryHash);
      if (mirrored) {
        checkedAt = Date.now();
        if (!mirrored.unchanged) keep(mirrored.catalog, mirrored.hash);
        return memory;
      }
    } catch (_) { /* no saved copy readable yet: fall through */ }
    // No copy in Firestore. Keep drawing what the phone has rather than wait;
    // only a phone with nothing asks the server.
    if (memory && !force) { checkedAt = Date.now(); return memory; }
    const data = await apiProviderService.getIimmpactFullCatalogForUser('MY');
    if (data && typeof data === 'object') { checkedAt = Date.now(); keep(data, ''); }
    return memory;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Fills memory from the phone's copy, once. */
async function warm() {
  if (memory) return;
  const saved = await readSaved();
  if (saved && !memory) { memory = saved.catalog; memoryHash = saved.hash || ''; }
}

/**
 * The shared catalogue as component state.
 *
 * `loading` is only true while nothing at all can be drawn; with a saved copy
 * the screen renders at once and `refreshing` covers the background check.
 */
export function useIimmpactCatalog({ enabled = true } = {}) {
  const [catalog, setCatalog] = useState(memory);
  const [loading, setLoading] = useState(enabled && !memory);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const listener = (data) => { if (alive) setCatalog(data); };
    listeners.add(listener);
    (async () => {
      await warm();
      if (!alive) return;
      if (memory) { setCatalog(memory); setLoading(false); }
      if (memory && Date.now() - checkedAt < RECHECK_MS) return;
      setRefreshing(!!memory);
      try {
        const data = await loadIimmpactCatalog();
        if (alive && data) { setCatalog(data); setError(''); }
      } catch (e) {
        if (alive && !memory) setError(e?.message || 'The MySheba catalogue is unavailable right now.');
      } finally {
        if (alive) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { alive = false; listeners.delete(listener); };
  }, [enabled]);

  return { catalog, loading, refreshing, error };
}

/** The catalogue for code outside React: memory, then the phone, then loadIimmpactCatalog. */
export async function getIimmpactCatalog() {
  await warm();
  if (memory) {
    if (Date.now() - checkedAt >= RECHECK_MS) loadIimmpactCatalog().catch(() => {});
    return memory;
  }
  return loadIimmpactCatalog();
}
