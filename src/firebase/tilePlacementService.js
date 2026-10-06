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
//   { roles: { superadmin: { rates: false, recharge: true } },
//     order: { superadmin: ['recharge', 'billpayment', ...] } }
//
// false takes a tile off that role's home screen, true puts one on it, and a
// tile named nowhere keeps whatever it declares. Nothing here can hide a tile
// or change where it goes - a tile taken off the home screen appears in More
// Features instead (see serviceTiles.overflowTiles), which is the rule this
// app already holds itself to: a finished feature lands on the home screen or
// in More Features, never nowhere. Switching a tile off entirely is still
// Grid Access, and it still wins: a tile that is off is off wherever it would
// otherwise have been placed.
//
// `order` is the second half of the same question: not just whether a tile is
// on the home screen but WHERE on it. A partial list is enough - the keys named
// in it lead, in that order, and everything else keeps the order it is declared
// in. That matters because the declared lists grow: a release that adds a tile
// must not need every role's order rewritten, and a role whose order was set
// once should not lose a new feature off the end of the world.
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
// Same ceiling for the order list, and the same reason.
const MAX_ORDER_PER_ROLE = 200;
// A tile key is a short identifier - a GRID_DEFS key, a wv_ key, or an
// ADMIN_HOME key. Length-capped so one long string cannot bloat the document
// every app reads at launch.
const MAX_KEY_LENGTH = 64;

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

/**
 * Keep only a usable order: a known role mapped to a list of distinct,
 * sanely-sized tile keys.
 *
 * Duplicates are dropped rather than kept, because a key appearing twice would
 * sort a tile into two positions and the second one would silently win. An
 * entry naming a tile this role does not have is harmless and is kept: a tile
 * can come back (Grid Access turns it on again) and dropping its position
 * would lose the arrangement in between.
 */
export function cleanOrder(data) {
  const byRole = data && typeof data === 'object' && !Array.isArray(data) ? data.order : null;
  if (!byRole || typeof byRole !== 'object' || Array.isArray(byRole)) return {};
  const out = {};
  for (const role of PLACEMENT_ROLES) {
    const list = byRole[role];
    if (!Array.isArray(list)) continue;
    const seen = new Set();
    const kept = [];
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const id = raw.trim();
      if (!id || id.length > MAX_KEY_LENGTH || seen.has(id)) continue;
      if (kept.length >= MAX_ORDER_PER_ROLE) break;
      seen.add(id);
      kept.push(id);
    }
    if (kept.length) out[role] = kept;
  }
  return out;
}

/**
 * Live placement: { tiles: { [role]: { [key]: boolean } }, order: { [role]: [key] } }.
 *
 * Both halves in one snapshot, from one document, so a grid can never render
 * with this launch's placement and last launch's order.
 */
export function subscribeTilePlacement(callback, onError) {
  return onSnapshot(
    DOC,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      callback({ tiles: cleanPlacement(data), order: cleanOrder(data) });
    },
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
  const doc = tilePlacement && typeof tilePlacement === 'object' ? tilePlacement : {};
  // Accepts the whole snapshot ({tiles, order}) or a bare role map, so a
  // caller that still has the old shape in hand keeps working rather than
  // reading `undefined` as "no overrides" and silently losing them.
  const byRole = doc.tiles && typeof doc.tiles === 'object' ? doc.tiles : doc;
  const tiles = byRole[String(role || '')];
  return tiles && typeof tiles === 'object' && !Array.isArray(tiles) ? tiles : {};
}

/** One role's tile order, or [] when it has none. */
export function orderFor(tilePlacement, role) {
  const doc = tilePlacement && typeof tilePlacement === 'object' ? tilePlacement : {};
  const byRole = doc.order && typeof doc.order === 'object' ? doc.order : {};
  const list = byRole[String(role || '')];
  return Array.isArray(list) ? list : [];
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

/** Store one role's tile order. Superadmin only. */
export async function setTileOrder(role, keys) {
  const r = String(role || '').trim();
  if (!PLACEMENT_ROLES.includes(r)) throw new Error('Unknown role.');
  if (!Array.isArray(keys)) throw new Error('An order must be a list of tile keys.');
  // Cleaned before it is written, not only after it is read: the same rule
  // either way, so what the screen sends back is what it will read next.
  const clean = cleanOrder({ order: { [r]: keys } })[r] || [];
  await setDoc(DOC, { order: { [r]: clean }, updatedAt: serverTimestamp() }, { merge: true });
  return clean;
}

/** Put one role back to the order its tiles are declared in. */
export async function resetRoleOrder(role) {
  const r = String(role || '').trim();
  if (!PLACEMENT_ROLES.includes(r)) throw new Error('Unknown role.');
  await setDoc(DOC, { order: { [r]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
  return null;
}
