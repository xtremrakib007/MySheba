// Superadmin control over the service catalogue: which countries and
// operators the pickers offer.
//
// Packages are NOT here - Admin > Pricing has edited those for a long time
// (see utils/catalogue.js for why a second place would be worse than none).
//
// settings/catalogue, read by every signed-in app because the Recharge,
// Internet and Offer Packs steps filter on it, written only by a superadmin.
// The rules for what it may contain, and how it combines with the shipped
// defaults, are in utils/catalogue.js - pure, so they can be tested directly
// rather than inferred from a render. This file is only the document.
//
// Nothing here deletes a shipped entry. Turning a country or operator off
// records it as disabled, so turning it back on restores exactly
// what the app ships with and a bad edit cannot lose a market.
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { cleanCatalogue, cleanCountry } from '../utils/catalogue';

const DOC = doc(db, 'settings', 'catalogue');

/** Empty, which is what every install starts as: defaults only. */
export const EMPTY_CATALOGUE = cleanCatalogue(null);

/** Live catalogue overrides, already cleaned. */
export function subscribeCatalogue(callback, onError) {
  return onSnapshot(
    DOC,
    (snap) => callback(cleanCatalogue(snap.exists() ? snap.data() : null)),
    (err) => { if (onError) onError(err); },
  );
}

// Every write below sends the WHOLE branch it changes rather than a nested
// merge. Firestore's merge cannot remove an array element, so a disabled list
// has to be written entire - and writing the branch means what is stored is
// always exactly what cleanCatalogue produced, never a half-merge of two
// shapes.
async function write(branch, value) {
  await setDoc(DOC, { [branch]: value, updatedAt: serverTimestamp() }, { merge: true });
}

/** Turn a shipped country off for the service pickers, or back on. */
export async function setCountryEnabled(catalogue, code, enabled) {
  const id = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(id)) throw new Error('A country needs a two-letter code.');
  const current = cleanCatalogue({ countries: catalogue?.countries }).countries;
  const disabled = new Set(current.disabled);
  if (enabled) disabled.delete(id); else disabled.add(id);
  await write('countries', { disabled: [...disabled], added: current.added });
  return !enabled;
}

/** Add a market the app does not ship with. */
export async function addCountry(catalogue, country) {
  const clean = cleanCountry(country);
  if (!clean) throw new Error('A country needs a two-letter code and a name.');
  const current = cleanCatalogue({ countries: catalogue?.countries }).countries;
  if (current.added.some((c) => c.code === clean.code)) throw new Error('That country is already added.');
  await write('countries', { disabled: current.disabled, added: [...current.added, clean] });
  return clean;
}

/** Remove a country that was ADDED here. A shipped one is disabled, not removed. */
export async function removeAddedCountry(catalogue, code) {
  const id = String(code || '').trim().toUpperCase();
  const current = cleanCatalogue({ countries: catalogue?.countries }).countries;
  await write('countries', { disabled: current.disabled, added: current.added.filter((c) => c.code !== id) });
}

function listBranch(catalogue, branch) {
  return cleanCatalogue({ [branch]: catalogue?.[branch] })[branch];
}

/** Turn one operator off for one country, or back on. */
export async function setOperatorEnabled(catalogue, country, operator, enabled) {
  const code = String(country || '').trim().toUpperCase();
  const name = String(operator || '').trim();
  if (!code || !name) throw new Error('Choose a country and an operator.');
  const current = listBranch(catalogue, 'operators');
  const disabled = { ...current.disabled };
  const set = new Set(disabled[code] || []);
  if (enabled) set.delete(name); else set.add(name);
  if (set.size) disabled[code] = [...set]; else delete disabled[code];
  await write('operators', { disabled, added: current.added });
}

/** Add an operator to one country. */
export async function addOperator(catalogue, country, operator) {
  const code = String(country || '').trim().toUpperCase();
  const name = String(operator || '').trim();
  if (!code) throw new Error('Choose a country first.');
  if (!name) throw new Error('Enter an operator name.');
  const current = listBranch(catalogue, 'operators');
  if ((current.added[code] || []).includes(name)) throw new Error('That operator is already added.');
  const added = { ...current.added, [code]: [...(current.added[code] || []), name] };
  await write('operators', { disabled: current.disabled, added });
  return name;
}

/** Remove an operator that was ADDED here. */
export async function removeAddedOperator(catalogue, country, operator) {
  const code = String(country || '').trim().toUpperCase();
  const name = String(operator || '').trim();
  const current = listBranch(catalogue, 'operators');
  const kept = (current.added[code] || []).filter((o) => o !== name);
  const added = { ...current.added };
  if (kept.length) added[code] = kept; else delete added[code];
  await write('operators', { disabled: current.disabled, added });
}
