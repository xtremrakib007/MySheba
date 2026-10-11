import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as apiProviderService from './apiProviderService';
import { IIMMPACT_CATALOG_CACHE_KEY } from '../components/iimmpactTiles';

// One copy of the Malaysian IIMMPACT catalogue for the whole app.
//
// More Features, the Marketplace, a category grid and a product form all draw
// from the same catalogue, and each used to fetch it for itself on open. The
// full-catalogue callable allows ten calls per ten minutes, so ordinary
// browsing - open More Features, open a category, go back, open another - ran
// into the rate limit and the grid came back as an error. Requests are now
// shared: one in flight at a time, reused for a few minutes, and the last good
// copy on disk draws the grid instantly while a refresh runs behind it.
const FRESH_MS = 5 * 60 * 1000;

let memory = null;
let fetchedAt = 0;
let inflight = null;
const listeners = new Set();

async function readSaved() {
  try {
    const saved = await AsyncStorage.getItem(IIMMPACT_CATALOG_CACHE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

/** The catalogue, from memory while fresh, otherwise from IIMMPACT. */
export function loadIimmpactCatalog({ force = false } = {}) {
  if (!force && memory && Date.now() - fetchedAt < FRESH_MS) return Promise.resolve(memory);
  if (inflight) return inflight;
  inflight = apiProviderService.getIimmpactFullCatalogForUser('MY')
    .then(async (data) => {
      if (data && typeof data === 'object') {
        memory = data;
        fetchedAt = Date.now();
        listeners.forEach((listener) => listener(data));
        try { await AsyncStorage.setItem(IIMMPACT_CATALOG_CACHE_KEY, JSON.stringify(data)); } catch (_) {}
      }
      return memory;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * The shared catalogue as component state.
 *
 * `loading` is only true while nothing at all can be drawn; with a saved copy
 * the screen renders at once and `refreshing` covers the background update.
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
      if (!memory) {
        const saved = await readSaved();
        // fetchedAt stays 0, so a copy from disk is drawn and then refreshed.
        if (saved && !memory) memory = saved;
      }
      if (!alive) return;
      if (memory) { setCatalog(memory); setLoading(false); }
      if (memory && Date.now() - fetchedAt < FRESH_MS) return;
      setRefreshing(!!memory);
      try {
        const data = await loadIimmpactCatalog();
        if (alive && data) { setCatalog(data); setError(''); }
      } catch (e) {
        if (alive) setError(e?.message || 'The IIMMPACT catalogue is unavailable.');
      } finally {
        if (alive) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { alive = false; listeners.delete(listener); };
  }, [enabled]);

  return { catalog, loading, refreshing, error };
}
