// MySheba's grids, drawn from the provider that serves the user's country.
//
// Malaysia (IIMMPACT) has five home groups, each a native grid one level down:
//
//   Mobile    Prepaid Reload, PIN, Internet, International Reload
//   Bills     Postpaid, Electric, Water, Streaming/TV, Loan, Local Council,
//             Broadband, JomPAY, International Bills
//   Vouchers  IIMMPACT's voucher categories -> products -> denomination
//   Games     IIMMPACT's game categories    -> products -> denomination
//   E-Wallet  Touch 'n Go PIN, Touch 'n Go Pinless, TrueMoney... -> denomination
//
// Each tile opens the flow that sells it, already past what the tile answers:
// Water Bill is Bill Payment on its biller step, Prepaid Reload is Recharge on
// its number step. Bills, vouchers, games and wallets come from IIMMPACT's
// live catalogue; Mobile and the fixed bill types are always there.
//
// Bangladesh (Success TopUp) has no category tree, so its groups are the
// services it sells - Mobile Recharge, Internet, Offer Packs, Bill Payment -
// with its own operators and bill categories inside.
//
// The fixed product tiles these groups replace are dropped (coveredKeys), so
// nothing is offered twice. Flight, Bus, Train, Visa, Remittance, Salary and
// the rest are untouched.
//
// Every tile carries a picture: the provider's own image where it has one,
// otherwise one of the app's tile photos, named in `art`.
//
// Pure: data in, tiles out.

import { billCategories, catalogCategories, categoryPhrase, PIN_CATEGORY_TILE_KEYS } from './iimmpactTiles';
import { rechargeOperators, internetOperators } from '../data/countries';
import { BILLERS, BILL_CATEGORIES } from '../data/billers';

export const IIMMPACT = 'iimmpact';
export const SUCCESS_TOPUP = 'successtopup';

/** Which provider's catalogue draws this country's grids. */
export function providerFor(country) {
  return String(country || '').trim().toUpperCase() === 'BD' ? SUCCESS_TOPUP : IIMMPACT;
}

const MY = { country: 'MY', currency: 'MYR' };
const slug = (value) => categoryPhrase(value).replace(/ /g, '_') || 'item';

// ---------------------------------------------------------------- Malaysia --

const MY_GROUPS = [
  { key: 'grp_mobile', name: 'Mobile', art: 'photoRecharge' },
  { key: 'grp_bills', name: 'Bills', art: 'photoBillpayment' },
  { key: 'grp_vouchers', name: 'Vouchers', art: 'photoRechargePin' },
  { key: 'grp_games', name: 'Games', art: 'photoEntertainment' },
  { key: 'grp_ewallet', name: 'E-Wallet', art: 'photoTngewallet' },
];

function mobileTiles() {
  return [
    { key: 'mobile_prepaid', name: 'Prepaid Reload', art: 'photoRecharge', kind: 'seededService', service: 'recharge', seed: MY, startStep: 1 },
    { key: 'mobile_pin', name: 'PIN', art: 'photoRechargePin', kind: 'pinCategory', pinCategory: 'mobile' },
    { key: 'mobile_internet', name: 'Internet', art: 'photoInternet', kind: 'seededService', service: 'internet', seed: MY, startStep: 1 },
    // Starts at the country: the destination is the first thing it asks.
    { key: 'mobile_international', name: 'International Reload', art: 'photoRemittance', kind: 'seededService', service: 'recharge', seed: {}, startStep: 0 },
  ];
}

// The bill types, in this order. `match` finds IIMMPACT's own category for it.
// A type IIMMPACT has no category for is left out: the old built-in biller
// list it used to fall back to named billers IIMMPACT does not sell.
const BILL_TYPES = [
  { key: 'bill_postpaid', name: 'Postpaid Bill', art: 'photoBillMobile', match: /postpaid|mobile/ },
  { key: 'bill_electric', name: 'Electric Bill', art: 'photoBillElectricity', match: /electric/ },
  { key: 'bill_water', name: 'Water Bill', art: 'photoBillWater', match: /water/ },
  { key: 'bill_tv', name: 'Streaming / TV Bill', art: 'photoBillTv', match: /stream|tv|astro|entertainment/ },
  { key: 'bill_loan', name: 'Loan', art: 'photoBillUtilities', match: /loan|financ/ },
  { key: 'bill_council', name: 'Local Council', art: 'photoBillUtilities', match: /council|majlis|municipal|assessment/ },
  { key: 'bill_broadband', name: 'Broadband Bill', art: 'photoBillInternet', match: /broadband|fibre|fiber|internet/ },
];

function billTiles(catalog) {
  const fromCatalog = billCategories(catalog);
  const tiles = [];
  for (const type of BILL_TYPES) {
    const found = fromCatalog.find((category) => type.match.test(category.key.replace(/^iimmpact:/, '')));
    if (!found) continue;
    const category = found.key;
    tiles.push({
      key: type.key,
      name: type.name,
      imageUrl: found.imageUrl || '',
      art: type.art,
      kind: 'seededService',
      service: 'billpayment',
      seed: { ...MY, category },
      startStep: 2,
    });
  }
  tiles.push(
    // JomPAY's own flow: biller code, Ref-1 and IC are asked on the next step.
    { key: 'bill_jompay', name: 'JomPAY', art: 'photoJompay', kind: 'seededService', service: 'billpayment', seed: { ...MY, category: 'jompay', provider: 'JomPAY' }, startStep: 3 },
    // Other countries' billers start at the country.
    { key: 'bill_international', name: 'International Bills', art: 'photoBillpayment', kind: 'seededService', service: 'billpayment', seed: {}, startStep: 0 },
  );
  return tiles;
}

// IIMMPACT categories whose group or name says what they are.
function categoriesWhere(catalog, test) {
  return catalogCategories(catalog).filter((category) => test(categoryPhrase(category.group), category.phrase, category));
}

const isWallet = (group, name) => /\bwallets?\b|ewallet/.test(`${group} ${name}`);
const isGame = (group, name) => /\b(games?|gaming|console|app stores?)\b/.test(`${group} ${name}`);
const isMobilePin = (group, name) => /^(mobile |telco )?pins?( vouchers?)?$/.test(name);
const isVoucher = (group, name, category) =>
  !isWallet(group, name) && !isGame(group, name) && !isMobilePin(group, name)
  && (/\b(vouchers?|gift cards?)\b/.test(group) || category.vouchersOnly);

function categoryTiles(categories) {
  return categories.map((category) => ({
    key: 'cat_' + slug(category.name),
    name: category.name,
    imageUrl: category.imageUrl || '',
    art: 'photoRechargePin',
    kind: 'iimmpactProducts',
    iimmpactCategory: category.name,
  }));
}

// Each wallet product is its own tile and opens straight on its amounts.
function walletTiles(catalog) {
  const products = (catalog && catalog.products) || {};
  const tiles = [];
  for (const category of categoriesWhere(catalog, isWallet)) {
    for (const code of category.codes) {
      const product = products[code];
      if (!product) continue;
      const name = String(product.name || code).trim();
      tiles.push({
        key: 'wallet_' + slug(code),
        name,
        imageUrl: String(product.image_url || ''),
        art: /touch\W*n\W*go|\btng\b/i.test(name) ? 'photoTngewallet' : 'photoWalletTransfer',
        kind: 'iimmpactProduct',
        productCode: String(product.code || code),
      });
    }
  }
  return tiles;
}

function malaysiaGroup(key, catalog) {
  const group = MY_GROUPS.find((item) => item.key === key);
  if (!group) return null;
  const tiles = {
    grp_mobile: () => mobileTiles(),
    grp_bills: () => billTiles(catalog),
    grp_vouchers: () => categoryTiles(categoriesWhere(catalog, isVoucher)),
    grp_games: () => categoryTiles(categoriesWhere(catalog, isGame)).map((tile) => ({ ...tile, art: 'photoEntertainment' })),
    grp_ewallet: () => walletTiles(catalog),
  }[key]();
  return { ...group, tiles };
}

// -------------------------------------------------------------- Bangladesh --

function successTopUpGroupList() {
  const bd = { country: 'BD', currency: 'BDT' };
  const operatorTiles = (service, operators) => operators.map((operator) => ({
    key: `${service}_bd_${slug(operator)}`,
    name: operator,
    // The screen draws the operator's own logo from this name.
    operator,
    art: service === 'internet' ? 'photoInternet' : service === 'offerpacks' ? 'photoOfferpacks' : 'photoRecharge',
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
      art: 'photo' + category.art.charAt(0).toUpperCase() + category.art.slice(1),
      kind: 'seededService',
      service: 'billpayment',
      seed: { ...bd, category: category.key },
      startStep: 2,
    }));
  return [
    { key: 'grp_bd_recharge', name: 'Mobile Recharge', art: 'photoRecharge', tiles: operatorTiles('recharge', rechargeOperators.BD || []) },
    { key: 'grp_bd_internet', name: 'Internet Packages', art: 'photoInternet', tiles: operatorTiles('internet', internetOperators.BD || []) },
    { key: 'grp_bd_offerpacks', name: 'Offer Packs', art: 'photoOfferpacks', tiles: operatorTiles('offerpacks', rechargeOperators.BD || []) },
    { key: 'grp_bd_bills', name: 'Bill Payment', art: 'photoBillpayment', tiles: billTiles },
  ].filter((group) => group.tiles.length > 0);
}

// ------------------------------------------------------------------ public --

/** One provider group with the tiles drawn inside it, or null. */
export function providerGroup({ provider, groupKey, catalog }) {
  if (provider === SUCCESS_TOPUP) return successTopUpGroupList().find((group) => group.key === groupKey) || null;
  return malaysiaGroup(groupKey, catalog);
}

/** The group tiles a home screen leads with, for this country. */
export function providerHomeTiles({ country }) {
  const provider = providerFor(country);
  const groups = provider === SUCCESS_TOPUP ? successTopUpGroupList() : MY_GROUPS;
  return groups.map((group) => ({
    key: group.key,
    name: group.name,
    art: group.art,
    kind: 'providerGroup',
    provider,
    groupKey: group.key,
    cat: 'recharge',
    home: true,
  }));
}

// The fixed product tiles the Malaysian groups replace.
const MY_COVERED = ['recharge', 'rechargePin', 'internet', 'billpayment', 'tngewallet', 'jompay', ...PIN_CATEGORY_TILE_KEYS];
// Malaysian product tiles a Bangladeshi user's provider does not sell.
const IIMMPACT_ONLY = ['tngewallet', 'jompay', 'esim', 'rechargePin', 'iimmpactCatalog', 'entertainment'];

/** The fixed tiles the provider groups replace, so they are not drawn again. */
export function coveredKeys({ country }) {
  if (providerFor(country) === SUCCESS_TOPUP) {
    return new Set(['recharge', 'internet', 'offerpacks', 'billpayment', ...IIMMPACT_ONLY, ...PIN_CATEGORY_TILE_KEYS]);
  }
  return new Set(MY_COVERED);
}
