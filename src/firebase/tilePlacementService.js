// Superadmin control over WHICH tiles sit on a role's home screen.
//
// Three settings documents already shape the grids, and this is the fourth
// question none of them answered:
//
//   settings/gridManagement  is the tile switched ON for this person at all
//   settings/tileLabels      what is it called and what does it look like
//   settings/webviews        where does a WebView tile point
//   settings/tilePlacement   is it on the HOME screen or in More Features
//
// The home screen was decided entirely by the `home: true` flags declared in
// components/serviceTiles.js, which meant changing it took a release. For a
// superadmin the flags are also simply wrong: every tile a superadmin has is
// flagged for home, so the superadmin home screen carried the whole catalogue
// and More Features came up empty.
//
// So: a per-role map of overrides to those flags.
//
//   { roles: { superadmin: { rates: false, recharge: true } } }
//
// false takes a tile off that role's home screen, true puts one on it, and a
// tile named nowhere keeps whatever it declares. Nothing here can hide a tile
// or change where it goes - a tile taken off the home screen appears in More
// Features instead (see serviceTiles.overflowTiles), which is the rule this
// app already holds itself to: a finished feature lands on the home screen or
// in More Features, never nowhere. Switching a tile off entirely is still
// Grid Access, and it still wins: a tile that is off is off wherever it would
// otherwise have been placed.
import { doc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from './config';

const DOC = doc(db, 'settings', 'tilePlacement');

/**
 * The roles that have a home screen of their own.
 *
 * Support and finance share one (utils/homeScreen sends both to staffHome),
 * and they are listed separately anyway because they do not see the same
 * tiles: the grid is filtered by capability before placement is applied.
 */
export const PLACEMENT_ROLES = ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'];

// A role's map must not grow without bound from a client write: the document
// is read by every signed-in app on every launch.
const MAX_TILES_PER_ROLE = 200;

/**
 * Keep only what this document is allowed to say: a known role, mapped to
 * tile keys mapped to booleans.
 *
 * Anything else is dropped rather than stored. A stale key from a removed
 * feature is harmless here - unlike gridManagement, placement is not an
 * allowlist of known tiles, because a superadmin can add WebView tiles whose
 * keys this file has never heard of. It still has to be a boolean, or the
 * merge below would hand `undefined` to a filter and read as "off".
 */
export function cleanPlacement(data) {
  const roles = data && typeof data === 'object' && !Array.isArray(data) ? data.roles : null;
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) return {};
  const out = {};
  for (const role of PLACEMENT_ROLES) {
    const tiles = roles[role];
    if (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)) continue;
    const kept = {};
    let n = 0;
    for (const [key, value] of Object.entries(tiles)) {
      if (typeof value !== 'boolean') continue;
      const id = String(key).trim();
      if (!id || n >= MAX_TILES_PER_ROLE) continue;
      kept[id] = value;
      n += 1;
    }
    if (n) out[role] = kept;
  }
  return out;
}

/** Live map of every role's overrides: { [role]: { [tileKey]: boolean } }. */
export function subscribeTilePlacement(callback, onError) {
  return onSnapshot(
    DOC,
    (snap) => callback(cleanPlacement(snap.exists() ? snap.data() : null)),
    (err) => { if (onError) onError(err); },
  );
}

/**
 * One role's overrides, as a plain map the tile pipeline can take.
 *
 * Returns an empty object for an unknown role rather than undefined, so a
 * caller never has to guard it - and so a role nobody has configured behaves
 * exactly as it did before this document existed.
 */
export function placementFor(tilePlacement, role) {
  const byRole = tilePlacement && typeof tilePlacement === 'object' ? tilePlacement : {};
  const tiles = byRole[String(role || '')];
  return tiles && typeof tiles === 'object' && !Array.isArray(tiles) ? tiles : {};
}

// Deliberately NOT a copy of the "is this tile on the home screen" rule.
// That rule is components/serviceTiles.tileOnHome, and it stays the only copy:
// two of them would drift, and a tile the grid thinks is on the home screen
// while More Features thinks it is in the overflow is a tile shown twice - or,
// the other way round, a finished feature on neither screen. This file's job
// ends at handing that function the overrides, via placementFor above.

/** Put one tile on, or take it off, one role's home screen. Superadmin only. */
export async function setTileOnHome(role, key, onHome) {
  const r = String(role || '').trim();
  const id = String(key || '').trim();
  if (!PLACEMENT_ROLES.includes(r)) throw new Error('Unknown role.');
  if (!id) throw new Error('A tile key is required.');
  await setDoc(DOC, { roles: { [r]: { [id]: !!onHome } }, updatedAt: serverTimestamp() }, { merge: true });
  return !!onHome;
}

/** Put one tile back to the placement it ships with. */
export async function clearTilePlacement(role, key) {
  const r = String(role || '').trim();
  const id = String(key || '').trim();
  if (!PLACEMENT_ROLES.includes(r)) throw new Error('Unknown role.');
  if (!id) throw new Error('A tile key is required.');
  await setDoc(DOC, { roles: { [r]: { [id]: deleteField() } }, updatedAt: serverTimestamp() }, { merge: true });
  return null;
}

/** Put a whole role back to the placement it ships with. */
export async function resetRolePlacement(role) {
  const r = String(role || '').trim();
  if (!PLACEMENT_ROLES.includes(r)) throw new Error('Unknown role.');
  await setDoc(DOC, { roles: { [r]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
  return null;
}
