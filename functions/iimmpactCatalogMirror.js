'use strict';

// MySheba's own copy of the IIMMPACT catalogue.
//
// IIMMPACT's /v2/catalog takes 10-15 seconds and every screen used to ask it
// directly. The customer-safe catalogue (publicIimmpactCatalog's output) is
// now kept in Firestore and served from there:
//
//   iimmpactCatalogMirror/{country}            meta: fetchedAt, chunkCount, hash
//   iimmpactCatalogMirror/{country}/chunks/{n} { data: <slice of the JSON> }
//
// It is chunked because one Firestore document holds at most 1 MiB and the
// catalogue, with every product's fields, can be larger. The app reads the
// meta document and its chunks directly (rules allow signed-in reads), so a
// page draws from MySheba's database without calling IIMMPACT at all.
//
// The copy is refreshed hourly by a schedule, on demand when it is older than
// MAX_AGE_MS, and marked stale when IIMMPACT reports a catalogue change.
//
// Only what publicIimmpactCatalog returns is stored - no costs, no secrets.
//
// The same storage serves other large provider lists under their own
// collection (the `collection` option): the JomPAY biller directory is kept
// in iimmpactJompayBillers/MY this way.

const crypto = require('crypto');

const MIRROR = 'iimmpactCatalogMirror';
const CHUNKS = 'chunks';
// 250k characters is at most ~1 MB even if every character took 4 bytes.
const CHUNK_CHARS = 250000;
const MAX_CHUNKS = 40;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

function countryKey(country) {
  const code = String(country || 'MY').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'MY';
}

/** The JSON text split into slices that each fit a Firestore document. */
function chunk(text) {
  const out = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) out.push(text.slice(i, i + CHUNK_CHARS));
  return out.length ? out : [''];
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** Whether a saved copy should be served as it is. */
function isFresh(meta, now = Date.now(), maxAgeMs = MAX_AGE_MS) {
  if (!meta || !meta.chunkCount) return false;
  if (meta.staleSince && millis(meta.staleSince) >= millis(meta.fetchedAt)) return false;
  return now - millis(meta.fetchedAt) < maxAgeMs;
}

/** Saves a catalogue. Chunks first, meta last, so a reader never sees a half-written copy. */
async function write(db, country, catalog, { now = new Date(), collection = MIRROR } = {}) {
  const key = countryKey(country);
  const text = JSON.stringify(catalog || {});
  const parts = chunk(text);
  if (parts.length > MAX_CHUNKS) throw new Error(`IIMMPACT catalogue too large to mirror (${text.length} characters).`);
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
  const ref = db.collection(collection).doc(key);
  const previous = await ref.get();
  const previousMeta = previous.exists ? { ...(previous.data() || {}) } : {};
  const previousCount = Number(previousMeta.chunkCount || 0);
  // A new generation per write: readers fetch chunks by the generation the
  // meta names, so an old meta never pairs with new chunks mid-write.
  const generation = hash.slice(0, 12);
  const batch = db.batch();
  parts.forEach((data, index) => {
    batch.set(ref.collection(CHUNKS).doc(`${generation}_${index}`), { data, index, generation });
  });
  await batch.commit();
  await ref.set({
    country: key,
    providerId: String(catalog?.providerId || '').slice(0, 100),
    fetchedAt: now,
    staleSince: null,
    chunkCount: parts.length,
    generation,
    hash,
    characters: text.length,
    productCount: Object.keys(catalog?.products || {}).length,
  });
  // The previous generation's chunks are no longer named by the meta.
  const oldGeneration = String(previousMeta.generation || '');
  if (oldGeneration && oldGeneration !== generation) {
    const cleanup = db.batch();
    for (let i = 0; i < previousCount; i += 1) cleanup.delete(ref.collection(CHUNKS).doc(`${oldGeneration}_${i}`));
    await cleanup.commit().catch(() => {});
  }
  return { generation, chunkCount: parts.length, characters: text.length };
}

/** The saved catalogue and its meta, or null when there is none (or it is damaged). */
async function read(db, country, { collection = MIRROR } = {}) {
  const ref = db.collection(collection).doc(countryKey(country));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const meta = snap.data() || {};
  const count = Number(meta.chunkCount || 0);
  if (!count || !meta.generation) return null;
  const docs = await Promise.all(Array.from({ length: count }, (_, i) => ref.collection(CHUNKS).doc(`${meta.generation}_${i}`).get()));
  if (docs.some((doc) => !doc.exists)) return null;
  try {
    return { meta, catalog: JSON.parse(docs.map((doc) => String(doc.data()?.data || '')).join('')) };
  } catch (_) {
    return null;
  }
}

/** Marks the copy stale, so the next request or schedule refreshes it. */
async function markStale(db, country, now = new Date()) {
  await db.collection(MIRROR).doc(countryKey(country)).set({ staleSince: now }, { merge: true });
}

/**
 * The catalogue, from the saved copy while it is fresh. Otherwise `fetchLive`
 * is asked and its answer saved; if that fails, an older copy still beats an
 * error.
 */
async function cachedCatalog(db, country, fetchLive, { maxAgeMs = MAX_AGE_MS, force = false, now = Date.now(), collection = MIRROR } = {}) {
  const saved = await read(db, country, { collection }).catch(() => null);
  if (!force && saved && isFresh(saved.meta, now, maxAgeMs)) return saved.catalog;
  try {
    const live = await fetchLive();
    await write(db, country, live, { collection }).catch((error) => console.error('IIMMPACT catalogue mirror write failed', String(error?.message || error)));
    return live;
  } catch (error) {
    if (saved) return saved.catalog;
    throw error;
  }
}

module.exports = { MIRROR, CHUNKS, CHUNK_CHARS, MAX_AGE_MS, countryKey, chunk, isFresh, write, read, markStale, cachedCatalog };
