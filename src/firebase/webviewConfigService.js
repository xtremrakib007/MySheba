// Superadmin control over the WebView tiles.
//
// The URL, title and icon of every WebView service were literals in
// src/data/countries.js (`webViewPages`). A government portal moving its
// status-check page, or a new partner site worth a tile, therefore meant a
// code change, a store build and a review - for a string.
//
// settings/webviews holds overrides for the built-in pages and any pages a
// superadmin adds. The built-ins stay in code as the defaults, so the app
// still works with no document at all and nothing can delete a service out
// from under the customer grid: a built-in can be edited and turned off, but
// not removed.
//
// A WebView renders a site inside the app, so the URL is not just data. Only
// https is accepted and the host has to look like a real one - javascript:,
// data: and file: never reach a WebView through here.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from './config';
import { webViewPages } from '../data/countries';

const DOC = doc(db, 'settings', 'webviews');

/** Keys that ship in the app. Editable, never deletable. */
export const BUILT_IN_KEYS = Object.keys(webViewPages);

// A custom key cannot collide with a built-in one, now or after a future
// release adds a service - hence the prefix rather than a free-form name.
const CUSTOM_KEY_RE = /^wv_[a-z0-9]{4,24}$/;

export function isCustomKey(key) {
  return CUSTOM_KEY_RE.test(String(key || ''));
}

export function newCustomKey() {
  return `wv_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * What a WebView page is allowed to be.
 *
 * Returns the cleaned page, or throws with the reason. The screen and the
 * service share it so a value the UI accepted cannot be one Firestore refuses.
 */
export function validatePage(page) {
  const name = String(page?.name || '').trim();
  const url = String(page?.url || '').trim();
  const title = String(page?.title || '').trim();
  const icon = String(page?.icon || '').trim();

  if (name.length < 2 || name.length > 40) throw new Error('Name must be 2-40 characters.');
  if (title.length > 60) throw new Error('Header title must be 60 characters or fewer.');
  if (icon.length > 8) throw new Error('Icon must be a single emoji or a short art name.');

  let parsed;
  try { parsed = new URL(url); } catch (e) { throw new Error('Enter a full address, starting with https://'); }
  // Only https. http is cleartext, and javascript:/data:/file: in a WebView
  // run with the app's own context - none of them are a "page" in any sense
  // this screen means.
  if (parsed.protocol !== 'https:') throw new Error('The address must start with https://');
  if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    throw new Error('That does not look like a real website address.');
  }

  // `home` is what puts the tile on the home grid rather than only under More
  // Services. New pages default to on: someone adding a WebView is adding it
  // to the grid, and a tile that lands two taps away looks like it failed.
  return { name, url, title: title || name, icon, active: page?.active !== false, home: page?.home !== false };
}

function sanitizePages(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!BUILT_IN_KEYS.includes(key) && !isCustomKey(key)) continue;
    try {
      out[key] = { ...validatePage(value), custom: !BUILT_IN_KEYS.includes(key) };
    } catch (e) {
      // A stored page that no longer validates is dropped rather than shown:
      // the built-in default is a working page, a half-valid override is not.
    }
  }
  return out;
}

/**
 * The built-in pages with any overrides applied.
 *
 * Every consumer reads this, so the grid, the WebView screen and the admin
 * list cannot disagree about what a page is.
 */
export function mergePages(data) {
  const overrides = sanitizePages(data && data.pages);
  const merged = {};
  for (const key of BUILT_IN_KEYS) {
    const base = webViewPages[key] || {};
    merged[key] = {
      key,
      name: base.title || key,
      url: base.url || '',
      title: base.title || '',
      icon: base.icon || '',
      active: true,
      home: true,
      custom: false,
      ...(overrides[key] || {}),
      key,
      custom: false,
    };
  }
  for (const [key, page] of Object.entries(overrides)) {
    if (BUILT_IN_KEYS.includes(key)) continue;
    merged[key] = { ...page, key, custom: true };
  }
  return merged;
}

export function subscribeWebviewConfig(callback, onError) {
  return onSnapshot(DOC, (snap) => callback(mergePages(snap.exists() ? snap.data() : null)), onError);
}

export async function ensureWebviewConfig() {
  const snap = await getDoc(DOC);
  return mergePages(snap.exists() ? snap.data() : null);
}

/** Create or edit one page. `key` is a built-in key or a wv_ key. */
export async function saveWebviewPage(key, page) {
  const id = String(key || '').trim();
  if (!BUILT_IN_KEYS.includes(id) && !isCustomKey(id)) throw new Error('Unknown WebView page.');
  const clean = validatePage(page);
  await setDoc(DOC, { pages: { [id]: clean }, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Remove a custom page. A built-in is refused: its tile, its pricing and in
 * some cases its charge-on-click behaviour are wired in code, so deleting the
 * override would not remove the service, only its settings.
 */
export async function deleteWebviewPage(key) {
  const id = String(key || '').trim();
  if (!isCustomKey(id)) throw new Error('A built-in WebView cannot be deleted. Turn it off instead.');
  await setDoc(DOC, { pages: { [id]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}

export const _test = { sanitizePages, CUSTOM_KEY_RE };
