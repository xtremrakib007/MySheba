import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from './config';
import { countryCodeOf } from '../utils/phoneCountry';

const DOC = doc(db, 'settings', 'gridManagement');

export const GRID_DEFS = [
  ['recharge','Recharge'],['rechargePin','Recharge PIN'],['mobilebanking','Mobile Banking'],['internet','Internet'],['billpayment','Bill Payment'],
  ['remittance','Remittance'],['bus','Bus'],['train','Train'],['flight','Flight'],['offerpacks','Offer Packs'],['entertainment','Entertainment'],
  ['topup','Top-Up'],['history','Transactions'],['support','Support'],['myAccount','My Account'],['profile','Profile'],
  ['dealerFeatures','Dealer Features'],['resellerFeatures','Reseller Features'],['adminFeatures','Admin Features'],
  ['moreFeaturesTile','More Services'],['walletTransfer','Wallet Transfer'],['myDocuments','My Documents'],
  // 'My Business' is gone: the tile was removed when its screen turned out
  // not to exist, so a toggle for it controlled nothing.
  ['salary','Salary & OT'],['kyc','Profile & KYC'],
  ['fomema','FOMEMA'],['visa','Visa Malaysia'],['mydigital','Malaysia Arrival Card'],['passport','Passport'],
  ['adminAnalytics','Analytics'],['inquiries','Inquiries'],['pending','Pending'],['topups','Top-Ups'],
  ['rates','Rates'],['pricing','Pricing'],['payments','Payments'],['transferPoints','Transfers'],['apiManagement','API Management'],
  ['userManagement','Users'],['verificationManagement','KYC Verification'],['featureAccess','Feature Access'],['banners','Banners'],['announcements','Announcements']
].map(([key,name]) => ({ key, name }));

export const DEFAULT_GRID_MANAGEMENT = Object.fromEntries(GRID_DEFS.map(({key}) => [key, key === 'rechargePin' ? false : true]));

// Who a tile is hidden from, as well as whether it is hidden.
//
// This was one flat {key: boolean} doc: a tile was on for everyone or off for
// everyone. That is the right default and stays the default, but it cannot say
// "FOMEMA only for Malaysian customers", "Rates for dealers but not resellers",
// or "turn this off for one account that keeps misusing it".
//
// So three scoped maps sit alongside the flat defaults, each from an id to the
// tiles it overrides:
//
//   byRole    { dealer: { rates: false } }
//   byCountry { BD: { fomema: false } }        ISO code, from the signup dial
//   byUser    { <uid>: { recharge: false } }
//
// Most specific wins: user, then country, then role, then the global default.
// An id that names no override falls straight through, so adding a scope
// changes nothing until someone sets something in it.
export const GRID_SCOPES = ['byRole', 'byCountry', 'byUser'];

function sanitizeScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [who, tiles] of Object.entries(value)) {
    if (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)) continue;
    const kept = {};
    // Only known tiles, only booleans: a stale key from a removed feature must
    // not resurrect itself as an override nobody can see in the UI.
    for (const { key } of GRID_DEFS) if (typeof tiles[key] === 'boolean') kept[key] = tiles[key];
    if (Object.keys(kept).length) out[String(who)] = kept;
  }
  return out;
}

function merge(data) {
  const out = { ...DEFAULT_GRID_MANAGEMENT };
  GRID_DEFS.forEach(({ key }) => { if (data && typeof data[key] === 'boolean') out[key] = data[key]; });
  // Without this the scoped maps would be dropped on every read, because merge
  // rebuilds the object from the known boolean keys alone.
  for (const scope of GRID_SCOPES) out[scope] = sanitizeScope(data && data[scope]);
  return out;
}

export function subscribeGridManagement(callback, onError) {
  return onSnapshot(DOC, snap => callback(snap.exists() ? merge(snap.data()) : merge(null)), onError);
}

export async function ensureGridManagement() {
  const snap = await getDoc(DOC);
  return snap.exists() ? merge(snap.data()) : merge(null);
}

/**
 * Turn a tile on or off, globally or for one role, country or user.
 *
 * @param {string} key    a GRID_DEFS key
 * @param {boolean} active
 * @param {{scope?: string, who?: string}} [target]
 *   Omit for the global default. Otherwise scope is one of GRID_SCOPES and who
 *   is the role name, ISO country code, or uid.
 */
export async function setGridActive(key, active, target = {}) {
  if (!GRID_DEFS.some(g => g.key === key)) throw new Error('Unknown grid.');
  const { scope, who } = target;
  if (!scope) {
    await setDoc(DOC, { [key]: Boolean(active), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  if (!GRID_SCOPES.includes(scope)) throw new Error('Unknown grid scope.');
  const id = String(who || '').trim();
  if (!id) throw new Error('Choose who this applies to first.');
  await setDoc(DOC, { [scope]: { [id]: { [key]: Boolean(active) } }, updatedAt: serverTimestamp() }, { merge: true });
}

/** Drop one override so the tile falls back to the next scope down. */
export async function clearGridOverride(key, scope, who) {
  if (!GRID_SCOPES.includes(scope)) throw new Error('Unknown grid scope.');
  const id = String(who || '').trim();
  if (!id) throw new Error('Choose who this applies to first.');
  await setDoc(DOC, { [scope]: { [id]: { [key]: deleteField() } }, updatedAt: serverTimestamp() }, { merge: true });
}

/** The override set for one id, or {} - what the editing UI shows. */
export function overridesFor(gridManagement, scope, who) {
  if (!GRID_SCOPES.includes(scope)) return {};
  return (gridManagement && gridManagement[scope] && gridManagement[scope][String(who || '')]) || {};
}

/**
 * Whether a tile shows.
 *
 * `viewer` is optional: called without one this answers the global default,
 * which is what every caller did before scopes existed.
 */
export function isGridActive(gridManagement, key, viewer) {
  const grid = gridManagement || {};
  const at = (scope, who) => {
    if (!who) return undefined;
    const tiles = grid[scope] && grid[scope][String(who)];
    const value = tiles && tiles[key];
    return typeof value === 'boolean' ? value : undefined;
  };
  const scoped = at('byUser', viewer && viewer.uid)
    ?? at('byCountry', viewer && viewer.country)
    ?? at('byRole', viewer && viewer.role);
  if (typeof scoped === 'boolean') return scoped;
  return grid[key] !== false;
}

/**
 * What "Default" means for one target.
 *
 * A scoped row offering Default / On / Off has to say what Default resolves to,
 * and for a user that is NOT the global setting: it is their country's rule,
 * then their role's, then the global one. Answering with the global default
 * would be wrong in exactly the cases a superadmin is looking at the screen to
 * understand. So the target's own override is removed from a copy of the doc
 * and the normal resolver answers the rest.
 *
 * @param {string} scope   one of GRID_SCOPES, or 'global'
 * @param {string} who     the role, ISO country code or uid being edited
 * @param {object} [target] for byUser: that user's own role and country, so
 *                          their inherited value accounts for both
 */
export function inheritedActive(gridManagement, key, scope, who, target = {}) {
  if (!GRID_SCOPES.includes(scope) || !who) return isGridActive(gridManagement, key);
  const copy = { ...(gridManagement || {}) };
  copy[scope] = { ...(copy[scope] || {}) };
  delete copy[scope][String(who)];
  const viewer = scope === 'byRole' ? { uid: '', role: who, country: '' }
    : scope === 'byCountry' ? { uid: '', role: '', country: who }
      : { uid: who, role: target.role || '', country: target.country || '' };
  return isGridActive(copy, key, viewer);
}

/**
 * The identity a tile is resolved against.
 *
 * One place builds it so a tile cannot be visible in the grid and refused by
 * the sidebar, which is what two different inline objects would eventually
 * drift into. Country comes from the signup dial code, the same derivation
 * User Management shows.
 */
export function viewerFor(profile) {
  return {
    uid: (profile && profile.uid) || '',
    role: (profile && profile.role) || '',
    country: countryCodeOf(profile),
  };
}

// Exported for scripts/test-grid-scopes.js: what the doc is allowed to
// contain is a rule worth testing directly rather than inferring from
// behaviour.
export const _test = { sanitizeScope, merge };

/** Which scope decided it, for the UI to explain itself. */
export function resolutionFor(gridManagement, key, viewer) {
  const grid = gridManagement || {};
  const pairs = [['byUser', viewer && viewer.uid], ['byCountry', viewer && viewer.country], ['byRole', viewer && viewer.role]];
  for (const [scope, who] of pairs) {
    if (!who) continue;
    const tiles = grid[scope] && grid[scope][String(who)];
    if (tiles && typeof tiles[key] === 'boolean') return { scope, who: String(who), active: tiles[key] };
  }
  return { scope: 'global', who: '', active: grid[key] !== false };
}
