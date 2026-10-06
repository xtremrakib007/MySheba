// Feature grid tiles a superadmin adds.
//
// settings/customTiles, read by every signed-in app because the grids draw
// from it, written only by a superadmin. What a tile may be - and the one
// thing it may never be, a destination of its own choosing - is in
// utils/customTiles.js, pure and testable. This file is only the document.
import { doc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from './config';
import { cleanCustomTile, isCustomTileKey, newCustomTileKey } from '../utils/customTiles';

const DOC = doc(db, 'settings', 'customTiles');

export { newCustomTileKey };

/** Live raw map: { [key]: storedTile }. Cleaning happens where it is used. */
export function subscribeCustomTiles(callback, onError) {
  return onSnapshot(
    DOC,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const tiles = data && data.tiles && typeof data.tiles === 'object' && !Array.isArray(data.tiles) ? data.tiles : {};
      callback(tiles);
    },
    (err) => { if (onError) onError(err); },
  );
}

/**
 * Create or edit one tile. Superadmin only - enforced by firestore.rules, not
 * by this function, which is a convenience and not a boundary.
 *
 * Validated with the SAME function the grids read through, so a tile the
 * screen accepted cannot be one the grids then refuse to draw. Rejecting here
 * is the difference between a clear message and a tile that saves and never
 * appears.
 */
export async function saveCustomTile(key, tile, categoryKeys) {
  const id = String(key || '').trim();
  if (!isCustomTileKey(id)) throw new Error('A tile needs a valid key.');
  const clean = cleanCustomTile(id, tile, categoryKeys);
  if (!clean) {
    throw new Error('A tile needs a name of at least two characters, a service it opens, and an answer for every step it skips.');
  }
  // Only the stored fields. `key`, `kind` and `custom` are derived when the
  // tile is read, so storing them would be a second copy to disagree with.
  await setDoc(DOC, {
    tiles: {
      [id]: {
        name: clean.name,
        service: clean.service,
        seed: clean.seed,
        startStep: clean.startStep,
        cat: clean.cat,
        home: clean.home,
        icon: clean.icon || '',
        art: clean.art || '',
      },
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return clean;
}

/** Remove one added tile. */
export async function deleteCustomTile(key) {
  const id = String(key || '').trim();
  if (!isCustomTileKey(id)) throw new Error('A tile needs a valid key.');
  await setDoc(DOC, { tiles: { [id]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
}
