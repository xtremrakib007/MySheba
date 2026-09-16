//
// This is a lightweight, on-device recommender rather than a server-side
// ML model - it scores the same client-side feed the home screen already
// using signals from that one user, so there's no separate training
// pipeline or model to run/host, matching this app's scale for Phase 3.
//
// Signals used, weighted by recency:
//     opened (see recordView below), capped client-side to the most
//     recent MAX_SIGNALS.
//     listings the user has bookmarked count as a stronger signal than a
//     view.
//
// Data model added by this file:
//     uid, recent: [{ category, ts (client Date.now() ms) }, ...]  (capped)
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const MAX_SIGNALS = 30; // rolling window of recent category views kept per user
const RECOMMEND_COUNT = 10; // how many cards the home screen's "Recommended for You" row shows

// A view is worth 1 point of category affinity, a save is worth 3 - saving
// something is a much stronger "I want more like this" signal than a
// passing glance.
const VIEW_WEIGHT = 1;
const SAVE_WEIGHT = 3;
// Signals older than this stop contributing - keeps recommendations
// tracking what the user is into *lately*, not their all-time history.
const SIGNAL_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Call when a listing detail screen finishes loading a listing, to log a
 * lightweight "this user looked at this category" signal. Best-effort -
 * failures are swallowed so a permissions/offline hiccup never blocks
 * browsing. */
export async function recordView(uid, category) {
  if (!uid || !category) return;
  try {
    const ref = doc(db, VIEWS, uid);
    const snap = await getDoc(ref);
    const prev = (snap.exists() && snap.data().recent) || [];
    const next = [...prev, { category, ts: Date.now() }].slice(-MAX_SIGNALS);
    await setDoc(ref, { uid, recent: next, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    // non-fatal - recommendations just fall back to recency-only ranking
  }
}

/** Live-subscribes to this user's view-signal doc. Returns an unsubscribe
 * function. Callback receives the raw `recent` array (or []). */
export function subscribeViewSignals(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  return onSnapshot(
    doc(db, VIEWS, uid),
    (snap) => callback((snap.exists() && snap.data().recent) || []),
    () => callback([])
  );
}

function decayedWeight(ageMs, baseWeight) {
  // Simple exponential decay so a category the user was into a month ago
  // matters less than one they were browsing yesterday.
  const halfLives = ageMs / SIGNAL_HALF_LIFE_MS;
  return baseWeight * Math.pow(0.5, halfLives);
}

/** Builds a { category: weight } affinity map from view signals and saved
 * cross-referenced against `listingsById` to recover each save's category
 * (the save doc itself only stores title/price/image for its own list
export function buildCategoryAffinity(viewSignals, saved, listingsById) {
  const now = Date.now();
  const weights = {};

  for (const s of viewSignals || []) {
    if (!s || !s.category) continue;
    const age = now - (s.ts || now);
    weights[s.category] = (weights[s.category] || 0) + decayedWeight(age, VIEW_WEIGHT);
  }

  for (const s of saved || []) {
    const listing = listingsById[s.listingId];
    const category = listing && listing.category;
    if (!category) continue;
    const ts = s.createdAt && s.createdAt.seconds ? s.createdAt.seconds * 1000 : now;
    const age = now - ts;
    weights[category] = (weights[category] || 0) + decayedWeight(age, SAVE_WEIGHT);
  }

  return weights;
}

/** Ranks active listings for the home screen's "Recommended for You" row.
 * - excludeIds: the viewer's own listings (and anything already sold,
 *   though subscribeActiveListings already filters status=='active').
 * - Falls back to plain recency (the existing feed order) when the user
 *   has no signals yet, so new users still see a populated row instead of
 *   an empty one. */
export function rankRecommendations(listings, categoryWeights, excludeIds) {
  const exclude = new Set(excludeIds || []);
  const candidates = (listings || []).filter((l) => l.status === 'active' && !exclude.has(l.id));
  const hasSignal = categoryWeights && Object.keys(categoryWeights).length > 0;

  if (!hasSignal) {
    return candidates.slice(0, RECOMMEND_COUNT);
  }

  const scored = candidates.map((listing, index) => {
    const affinity = categoryWeights[listing.category] || 0;
    // Tiny recency nudge (by feed position, since the feed is already
    // newest-first) so ties between equally-affine listings favor the
    // fresher one rather than array order.
    const recencyNudge = 1 - index / Math.max(candidates.length, 1);
    return { listing, score: affinity + recencyNudge * 0.01 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, RECOMMEND_COUNT).map((s) => s.listing);
}
