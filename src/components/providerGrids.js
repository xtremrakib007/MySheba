// MySheba's grids, drawn from the provider that serves the user's country.
//
// A Malaysian user's home screen leads with IIMMPACT's own groups (Mobile,
// Bills, Vouchers, Games, ...): each opens a native grid of that group's
// categories, and each category opens the flow that sells it - Mobile Prepaid
// is Mobile Recharge already on its number step, Water Bills is Bill Payment
// already on its biller step, a voucher category is its product grid.
//
// A Bangladeshi user's is drawn from Success TopUp. It has no category tree,
// so its groups are the services it sells - Mobile Recharge, Internet, Offer
// Packs, Bill Payment - and the tiles inside are its own operators and
// billers, each opening that flow with the operator or bill category chosen.
//
// The fixed product tiles these groups replace are dropped (coveredKeys), so
// nothing is offered twice. Everything that is not a provider product -
// Flight, Bus, Train, Visa, Remittance, Salary - is untouched.
//
// Pure: data in, tiles out.

import { catalogCategories, catalogTileKey, categoryPhrase, nativeTileFor } from './iimmpactTiles';
import { PIN_CATEGORY_TILE_KEYS } from './iimmpactTiles';
import { rechargeOperators, internetOperators } from '../data/countries';
import { BILLERS, BILL_CATEGORIES } from '../data/billers';

export const IIMMPACT = 'iimmpact';
export const SUCCESS_TOPUP = 'successtopup';

/** Which provider's catalogue draws this country's grids. */
export function providerFor(country) {
  return String(country || '').trim().toUpperCase() === 'BD' ? SUCCESS_TOPUP : IIMMPACT;
}

// The drawing a group shows when the provider has no icon for it.
function groupArt(name) {
  const p = categoryPhrase(name);
  if (/\bbills?\b|utilit/.test(p)) return 'billpayment';
  if (/vouchers?|gift|pin/.test(p)) return 'rechargePin';
  if (/games?|gaming|entertainment/.test(p)) return 'entertainment';
  if (/wallet/.test(p)) return 'walletTransfer';
  if (/\be ?sim|travel/.test(p)) return 'esim';
  if (/internet|data/.test(p)) return 'internet';
  if (/mobile|top ?up|recharge|prepaid/.test(p)) return 'recharge';
  return 'more';
}

const groupKey = (name) => 'grp_' + (categoryPhrase(name).replace(/ /g, '_') || 'other');

/**
 * IIMMPACT's groups in its own order, each with its categories. A category in
 * no group (Other Products) gets a group of its own rather than vanishing.
 */
export function iimmpactGroups(catalog) {
  const icons = new Map();
  for (const group of Array.isArray(catalog?.tree?.groups) ? catalog.tree.groups : []) {
    if (group?.name && !icons.has(categoryPhrase(group.name))) icons.set(categoryPhrase(group.name), String(group.icon_url || ''));
  }
  const groups = new Map();
  for (const category of catalogCategories(catalog)) {
    const name = category.group || category.name;
    const key = groupKey(name);
    if (!groups.has(key)) {
      groups.set(key, { key, name, imageUrl: icons.get(categoryPhrase(name)) || '', art: groupArt(name), categories: [] });
    }
    groups.get(key).categories.push(category);
  }
  return [...groups.values()];
}

/**
 * The tile a catalogue category is inside its group: the native flow that
 * sells it, started at the step after what the category already answers, or
 * its product grid when no native flow does.
 */
export function categoryTile(category, nativeKeys) {
  const base = {
    key: catalogTileKey(category.name),
    name: category.name,
    imageUrl: category.imageUrl || '',
    art: category.imageUrl ? undefined : groupArt(category.group || category.name),
  };
  const malaysia = { country: 'MY', currency: 'MYR' };
  switch (nativeTileFor(category, nativeKeys)) {
    case 'billpayment':
      return { ...base, kind: 'seededService', service: 'billpayment', seed: { ...malaysia, category: 'iimmpact:' + category.phrase }, startStep: 2 };
    case 'recharge':
      // International top-up starts at the country; Malaysian airtime is
      // already in Malaysia and starts at the number.
      return /international/.test(category.phrase)
        ? { ...base, kind: 'seededService', service: 'recharge', seed: {}, startStep: 0 }
        : { ...base, kind: 'seededService', service: 'recharge', seed: malaysia, startStep: 1 };
    case 'internet':
      return { ...base, kind: 'seededService', service: 'internet', seed: malaysia, startStep: 1 };
    case 'esim':
      return { ...base, kind: 'seededService', service: 'esim', seed: {}, startStep: 0 };
    case 'rechargePin':
      return { ...base, kind: 'pinCategory', pinCategory: 'mobile' };
    default:
      return { ...base, kind: 'iimmpactProducts', iimmpactCategory: category.name };
  }
}

// Success TopUp's groups: the services it sells, each with its own operators
// or bill categories as the tiles inside.
function successTopUpGroupList() {
  const bd = { country: 'BD', currency: 'BDT' };
  const operatorTiles = (service, operators) => operators.map((operator) => ({
    key: `${service}_bd_${categoryPhrase(operator).replace(/ /g, '_')}`,
    name: operator,
    // The screen draws the operator's own logo from this name.
    operator,
    kind: 'seededService',
    service,
    seed: { ...bd, operator },
    startStep: 1,
  }));
  const billTiles = BILL_CATEGORIES
    .filter((category) => (BILLERS.BD?.[category.key] || []).length > 0)
    .map((category) => ({
      key: `billpayment_bd_${category.key}`,
      name: category.label,
      art: category.art,
      kind: 'seededService',
      service: 'billpayment',
      seed: { ...bd, category: category.key },
      startStep: 2,
    }));
  return [
    { key: 'grp_bd_recharge', name: 'Mobile Recharge', art: 'recharge', tiles: operatorTiles('recharge', rechargeOperators.BD || []) },
    { key: 'grp_bd_internet', name: 'Internet Packages', art: 'internet', tiles: operatorTiles('internet', internetOperators.BD || []) },
    { key: 'grp_bd_offerpacks', name: 'Offer Packs', art: 'offerpacks', tiles: operatorTiles('offerpacks', rechargeOperators.BD || []) },
    { key: 'grp_bd_bills', name: 'Bill Payment', art: 'billpayment', tiles: billTiles },
  ].filter((group) => group.tiles.length > 0);
}

/** One provider group with the tiles drawn inside it, or null. */
export function providerGroup({ provider, groupKey: key, catalog, nativeKeys }) {
  if (provider === SUCCESS_TOPUP) return successTopUpGroupList().find((group) => group.key === key) || null;
  const group = iimmpactGroups(catalog).find((item) => item.key === key);
  if (!group) return null;
  return { ...group, tiles: group.categories.map((category) => categoryTile(category, nativeKeys)) };
}

/** The group tiles a home screen leads with, for this country. */
export function providerHomeTiles({ country, catalog }) {
  const provider = providerFor(country);
  const groups = provider === SUCCESS_TOPUP ? successTopUpGroupList() : iimmpactGroups(catalog);
  return groups.map((group) => ({
    key: group.key,
    name: group.name,
    imageUrl: group.imageUrl || '',
    art: group.imageUrl ? undefined : group.art,
    kind: 'providerGroup',
    provider,
    groupKey: group.key,
    cat: 'recharge',
    home: true,
  }));
}

// Malaysian product tiles a Bangladeshi user's provider does not sell.
const IIMMPACT_ONLY = ['tngewallet', 'jompay', 'esim', 'rechargePin', 'iimmpactCatalog', 'entertainment'];

/**
 * The fixed tiles the provider groups replace, so they are not drawn again
 * beside them. Empty when there is nothing to draw groups from, which keeps
 * the fixed grid exactly as it was while the catalogue has never loaded.
 */
export function coveredKeys({ country, catalog, nativeKeys }) {
  if (providerFor(country) === SUCCESS_TOPUP) {
    return new Set(['recharge', 'internet', 'offerpacks', 'billpayment', ...IIMMPACT_ONLY, ...PIN_CATEGORY_TILE_KEYS]);
  }
  const categories = catalogCategories(catalog);
  if (!categories.length) return new Set();
  const covered = new Set(categories.map((category) => nativeTileFor(category, nativeKeys)).filter(Boolean));
  // The PIN Generator's own category tiles are views over IIMMPACT's voucher
  // categories, which the Vouchers group now shows under IIMMPACT's names.
  if (categories.some((category) => category.vouchersOnly)) PIN_CATEGORY_TILE_KEYS.forEach((key) => covered.add(key));
  return covered;
}
