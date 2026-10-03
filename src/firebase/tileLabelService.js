// Superadmin control over what every tile is called and what it looks like.
//
// WebView tiles have been editable for a while - settings/webviews carries a
// name, an icon and a URL for each. Nothing else was: "Mobile Top-Up",
// "Remittance", "Support Inbox" and the rest were literals, so renaming one to
// match how staff actually talk about it, or giving it a clearer icon, meant a
// release.
//
// settings/tileLabels holds overrides keyed by the tile's key. The declared
// lists stay the defaults, so the app works with no document at all, and an
// override is only ever a label and an icon - never a destination. A tile
// renamed to something confusing is a bad name; a tile repointed somewhere else
// would be a way to dress one feature up as another, so this cannot do it.
//
// Switching a tile OFF is Grid Access (settings/gridManagement), and a WebView's
// URL is WebView Pages (settings/webviews). This is only the label and the
// picture.
import { doc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from './config';

const DOC = doc(db, 'settings', 'tileLabels');

const MAX_NAME = 40;

/**
 * What an override is allowed to be.
 *
 * `name` is trimmed and capped: a tile label is drawn in a box about eighty
 * pixels wide, and a long one does not wrap gracefully, it just stops being
 * readable. `icon` is either the name of a drawing the app ships or a short
 * piece of text used as an emoji - anything else is dropped rather than drawn
 * as a broken box.
 */
export function cleanOverride({ name, icon } = {}, { isArtName } = {}) {
  const out = {};
  const trimmedName = String(name || '').trim().slice(0, MAX_NAME);
  if (trimmedName) out.name = trimmedName;
  const trimmedIcon = String(icon || '').trim().slice(0, 12);
  if (trimmedIcon) {
    // A drawing is referenced by name; anything else is treated as text to
    // print, which is what an emoji is.
    out.icon = trimmedIcon;
    out.iconIsArt = typeof isArtName === 'function' ? !!isArtName(trimmedIcon) : false;
  }
  return out;
}

/** Live map of every override: { [tileKey]: { name, icon, iconIsArt } }. */
export function subscribeTileLabels(callback, onError) {
  return onSnapshot(
    DOC,
    (snap) => callback((snap.exists() ? snap.data() : {})?.tiles || {}),
    (err) => { if (onError) onError(err); },
  );
}

/**
 * Save one tile's override. Superadmin only - enforced by firestore.rules, not
 * by this function, which is a convenience and not a boundary.
 */
export async function saveTileLabel(key, override, options) {
  const id = String(key || '').trim();
  if (!id) throw new Error('A tile key is required.');
  const clean = cleanOverride(override, options);
  if (!clean.name && !clean.icon) return resetTileLabel(id);
  await setDoc(DOC, { tiles: { [id]: clean }, updatedAt: serverTimestamp() }, { merge: true });
  return clean;
}

/** Put a tile back to the name and icon it ships with. */
export async function resetTileLabel(key) {
  const id = String(key || '').trim();
  if (!id) throw new Error('A tile key is required.');
  await setDoc(DOC, { tiles: { [id]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
  return null;
}
