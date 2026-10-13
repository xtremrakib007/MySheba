import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from './config';

const listFn = httpsCallable(functions, 'listApiProviders');
const saveFn = httpsCallable(functions, 'saveApiProvider');
const deleteFn = httpsCallable(functions, 'deleteApiProvider');
const getModesFn = httpsCallable(functions, 'getServiceApiSettings');
const saveModesFn = httpsCallable(functions, 'saveServiceApiSettings');
const drivesFn = httpsCallable(functions, 'listSuccessTopUpDrives');
const dataPlansFn = httpsCallable(functions, 'listProviderDataPlans');
const presentmentFn = httpsCallable(functions, 'getBillPresentment');
const networkStatusFn = httpsCallable(functions, 'getNetworkStatus');
const productCodesFn = httpsCallable(functions, 'listProviderProductCodes');
const iimmpactCatalogFn = httpsCallable(functions, 'getIimmpactCatalog');
const iimmpactUserCatalogFn = httpsCallable(functions, 'getIimmpactCatalogForUser');
const iimmpactFullCatalogFn = httpsCallable(functions, 'getIimmpactFullCatalogForUser');
const iimmpactOptionsFn = httpsCallable(functions, 'getIimmpactOptions');
const jompayBillerFn = httpsCallable(functions, 'lookupJompayBiller');
const chargeIimmpactProductFn = httpsCallable(functions, 'chargeIimmpactProduct');
const testFn = httpsCallable(functions, 'testApiProvider');
const adminCatalogFn = httpsCallable(functions, 'listSuccessTopUpCatalogForAdmin');
const balanceFn = httpsCallable(functions, 'getSuccessTopUpBalance');

// Must match ALLOWED_SERVICES in functions/apiProviderService.js. A service
// the backend routes but this list omits cannot be configured by a
// superadmin at all: 'Offer Packs' was missing, so the only provider that
// could ever serve it was the one Success TopUp provisions for itself.
// scripts/test-api-provider.js fails the build if the two lists drift.
export const API_SERVICES = ['Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN', 'eSIM'];
export async function listApiProviders() { const res = await listFn({}); return res.data?.providers || res.data || []; }
export async function saveApiProvider(provider) { return (await saveFn(provider)).data; }

/**
 * Our floats with Success TopUp. Superadmin only, enforced in the callable -
 * this is trading capacity, not any customer's money.
 *
 * Returns { balance, driveBalance, checkedAt }. Drives are funded separately,
 * so either can be empty while the other is fine. Null means the provider did
 * not report that number; zero means it reported zero.
 */
export async function getSuccessTopUpBalance() { return (await balanceFn({})).data; }
export async function deleteApiProvider(id) { return (await deleteFn({ id })).data; }
export async function getServiceApiSettings() { return (await getModesFn({})).data; }
/**
 * Service defaults plus the per-country overrides. countryModes is what keeps
 * Bangladesh on the API while every other country keeps going to a human, so
 * it is sent on every save - omitting it would clear the matrix.
 */
export async function saveServiceApiSettings(modes, countryModes) { return (await saveModesFn({ modes, countryModes })).data; }

export async function testApiProvider(id) { return (await testFn({ id })).data; }

// drivesFn was built above but never exported, so InternetSteps' call to
// apiProviderService.listSuccessTopUpDrives resolved to undefined.
export async function listSuccessTopUpDrives(operator, type, service = 'Internet', operatorName = '') {
  return (await drivesFn({ operator, type, service, operatorName })).data?.drives || [];
}

/**
 * The data plans one number is eligible for, from the configured provider.
 *
 * `supported` is the answer to "does this country and operator have per-number
 * plans at all", and it is false far more often than it is true - most pairs
 * have no such provider and keep the package list they already had. It is
 * returned rather than inferred from an empty list, because "this operator
 * does not work this way" and "this number has no plans available" are
 * different things to tell somebody.
 */
export async function listProviderDataPlans({ service = 'Internet', country, operator, phone }) {
  // Kept like denominations (see getIimmpactOptions): per number, since the
  // plans are personalised to it, and re-checked by the server on confirm.
  const key = ['plans', service, country, operator, String(phone || '').replace(/\D/g, '')].join('|');
  return keptProviderAnswer(key, String(operator || ''), async () => {
    const { data } = await dataPlansFn({ service, country, operator, phone });
    return { plans: data?.plans || [], supported: data?.supported === true };
  }, (result) => result.supported && result.plans.length > 0);
}

/**
 * The bill behind an account number, where the provider can read one.
 *
 * Advisory: `blocking` is true for exactly one answer - the provider saying the
 * account number is not theirs. Everything else, including a failure, comes
 * back as "nothing to show" and the customer carries on. A rejected promise is
 * treated the same way for the same reason, so a caller never has to decide
 * whether a network error is a reason not to pay a bill.
 */
/**
 * Superadmin only: the provider's own product list, for filling in the code
 * maps. Nothing can be guessed here, so this is where the codes come from.
 */
export async function listProviderProductCodes(id) {
  return (await productCodesFn({ id })).data?.products || [];
}

export async function getIimmpactCatalog(id) {
  return (await iimmpactCatalogFn({ id })).data || {};
}

export async function getIimmpactCatalogForUser(providerId = '', service = 'Recharge', country = '') {
  return (await iimmpactUserCatalogFn({ providerId, service, country })).data || {};
}

export async function getIimmpactFullCatalogForUser(country = 'MY') {
  return (await iimmpactFullCatalogFn({ country })).data || {};
}

export async function chargeIimmpactProduct(payload, customer = {}) {
  try {
    return (await chargeIimmpactProductFn({ payload, customer })).data || {};
  } catch (error) {
    forgetIimmpactOptionsOn(error, payload?.raw?.productCode);
    throw error;
  }
}

// Denominations and plans, kept in MySheba.
//
// Every amount screen asked IIMMPACT for its options each time it opened, so
// browsing - open Digi Pin, go back, open it again - was a provider call per
// tap, and a slow or rate-limited answer left the amounts blank. Options are
// now kept on the device for OPTIONS_TTL_MS: a screen draws them instantly and
// IIMMPACT is not asked again until they expire.
//
// This never decides a price. Every purchase is re-checked against IIMMPACT on
// the server when the customer confirms; if a kept amount has gone stale the
// server refuses it ("price has changed", "no longer available") and
// forgetIimmpactOptionsOn() drops the copy so the next open is fresh.
const OPTIONS_TTL_MS = 12 * 60 * 60 * 1000;
const OPTIONS_STORE_KEY = '@mysheba/iimmpact-options/v1';
const OPTIONS_MAX_ENTRIES = 300;
let optionsMemory = null;
const optionsInflight = new Map();

async function optionsStore() {
  if (optionsMemory) return optionsMemory;
  try {
    const saved = await AsyncStorage.getItem(OPTIONS_STORE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    optionsMemory = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    optionsMemory = {};
  }
  return optionsMemory;
}

async function saveOptionsStore() {
  try {
    const entries = Object.entries(optionsMemory || {}).sort((a, b) => b[1].at - a[1].at).slice(0, OPTIONS_MAX_ENTRIES);
    optionsMemory = Object.fromEntries(entries);
    await AsyncStorage.setItem(OPTIONS_STORE_KEY, JSON.stringify(optionsMemory));
  } catch (_) {}
}

// A provider answer from the device when one is kept and fresh, otherwise
// from the provider - once, however many screens ask at the same moment.
// `worthKeeping` rejects empty answers: those are more often a hiccup than a
// product with nothing to sell, and keeping one would hide amounts for hours.
async function keptProviderAnswer(key, product, fetch, worthKeeping) {
  const store = await optionsStore();
  const kept = store[key];
  if (kept && Date.now() - kept.at < OPTIONS_TTL_MS) return kept.data;
  if (optionsInflight.has(key)) return optionsInflight.get(key);
  const request = fetch()
    .then(async (data) => {
      if (worthKeeping(data)) {
        store[key] = { at: Date.now(), product, data };
        await saveOptionsStore();
      }
      return data;
    })
    .finally(() => { optionsInflight.delete(key); });
  optionsInflight.set(key, request);
  return request;
}

// MySheba's saved copy of one amount list (functions/iimmpactOptionsMirror.js
// writes it; the document id is built the same way). Null when there is none
// or it is too old - the caller then asks the server.
const OPTIONS_MIRROR = 'iimmpactOptionsMirror';
const OPTIONS_MIRROR_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export function optionsMirrorId(productCode, fieldId) {
  const clean = (v) => String(v || '').trim().replace(/[/\s]+/g, '_').slice(0, 200);
  return `${clean(productCode)}__${clean(fieldId)}`;
}
async function readOptionsMirror(productCode, fieldId) {
  try {
    const snap = await getDoc(doc(db, OPTIONS_MIRROR, optionsMirrorId(productCode, fieldId)));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    const savedAt = data.savedAt && typeof data.savedAt.toMillis === 'function' ? data.savedAt.toMillis() : 0;
    if (!savedAt || Date.now() - savedAt > OPTIONS_MIRROR_MAX_AGE_MS || typeof data.json !== 'string') return null;
    const answer = JSON.parse(data.json);
    return answer && Array.isArray(answer.items) && answer.items.length ? answer : null;
  } catch (_) {
    return null;
  }
}

export async function getIimmpactOptions({ providerId = '', productCode, fieldId, accountNumber = '', billerCode = '', page = 1, limit = 100, service = 'Recharge', country = '' }) {
  // A list that is the same for every customer - no account, no biller, the
  // first page - is one list whichever screen asks, so it is kept once and
  // read first from the phone, then from MySheba's Firestore copy; only when
  // neither has it does the server (and IIMMPACT) get asked.
  const shareable = !accountNumber && !billerCode && Number(page) === 1;
  if (shareable) {
    const key = ['shared', productCode, fieldId].map((v) => String(v ?? '')).join('|');
    return keptProviderAnswer(key, String(productCode || ''), async () => (
      (await readOptionsMirror(productCode, fieldId))
      || (await iimmpactOptionsFn({ providerId, productCode, fieldId, accountNumber, billerCode, page, limit, service, country })).data
      || {}
    ), (data) => Array.isArray(data.items) && data.items.length > 0);
  }
  // Keyed by everything that changes the answer: per-number plans are kept per
  // number, a biller's options per biller.
  const key = [service, country, providerId, productCode, fieldId, accountNumber, billerCode, page, limit].map((v) => String(v ?? '')).join('|');
  return keptProviderAnswer(key, String(productCode || ''), async () => (
    (await iimmpactOptionsFn({ providerId, productCode, fieldId, accountNumber, billerCode, page, limit, service, country })).data || {}
  ), (data) => Array.isArray(data.items) && data.items.length > 0);
}

/**
 * Fetches, in the background, the amount lists of products a customer is
 * looking at, so the one they tap is already on the phone. Only lists that
 * are the same for everyone (see getIimmpactOptions); a failure is ignored.
 */
export function prefetchIimmpactOptions(products, { max = 24 } = {}) {
  const list = (Array.isArray(products) ? products : []).slice(0, max);
  for (const product of list) {
    for (const field of (Array.isArray(product?.fields) ? product.fields : [])) {
      if (!field || field.type !== 'select' || !field.id) continue;
      const source = field.data_source || {};
      if (Array.isArray(source.depends_on) && source.depends_on.length) continue;
      const params = source.params || {};
      if (Object.values(params).some((spec) => spec && typeof spec === 'object' && spec.from_field)) continue;
      const staticOf = (spec) => (spec && typeof spec === 'object' && spec.static !== undefined ? String(spec.static) : '');
      getIimmpactOptions({
        productCode: staticOf(params.product_code) || String(product.code || ''),
        fieldId: staticOf(params.field_id) || String(field.id),
      }).catch(() => {});
    }
  }
}

// JomPAY's biller directory, through MySheba (which keeps IIMMPACT's list for
// a day). Answers are kept for the session: a code's biller does not change
// while somebody is typing it in again.
const jompayAnswers = new Map();

/**
 * The JomPAY biller for a code: { available, biller } - biller null when the
 * directory has no such code, available false when the directory could not be
 * had (the app then says nothing rather than doubt a valid code).
 */
export async function lookupJompayBiller(billerCode) {
  const code = String(billerCode || '').replace(/\D/g, '');
  if (!code) return { available: false, biller: null };
  const key = 'code:' + code;
  if (jompayAnswers.has(key)) return jompayAnswers.get(key);
  const { data } = await jompayBillerFn({ billerCode: code });
  const answer = { available: data?.available === true, biller: data?.biller || null };
  if (answer.available) jompayAnswers.set(key, answer);
  return answer;
}

/** Billers whose name contains every word typed: { available, results }. */
export async function searchJompayBillers(query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return { available: true, results: [] };
  const key = 'q:' + q;
  if (jompayAnswers.has(key)) return jompayAnswers.get(key);
  const { data } = await jompayBillerFn({ query: q });
  const answer = { available: data?.available === true, results: Array.isArray(data?.results) ? data.results : [] };
  if (answer.available) jompayAnswers.set(key, answer);
  return answer;
}

/** Drop kept options: one product's, or all of them. */
export async function forgetIimmpactOptions(productCode = '') {
  const store = await optionsStore();
  for (const [key, entry] of Object.entries(store)) {
    if (!productCode || entry.product === String(productCode)) delete store[key];
  }
  await saveOptionsStore();
}

/**
 * After a purchase fails, drop kept options if the failure says a kept amount
 * was stale, so the customer sees IIMMPACT's current amounts when they retry.
 */
export function forgetIimmpactOptionsOn(error, productCode = '') {
  if (/price has changed|no longer available|reload the product|choose it again|amount is no longer/i.test(String(error?.message || ''))) {
    forgetIimmpactOptions(productCode).catch(() => {});
  }
}

/**
 * Whether the biller or operator is having problems right now.
 *
 * Advisory and nothing else - there is no field here that could stop a payment,
 * deliberately. A failure is silence rather than a warning: a scary sentence on
 * a healthy product talks somebody out of paying for no reason, which is the
 * only harm this feature is capable of.
 */
export async function getNetworkStatus(input) {
  try {
    const { data } = await networkStatusFn(input);
    return { status: data?.status || 'unknown', notice: data?.notice || '' };
  } catch {
    return { status: 'unknown', notice: '' };
  }
}

export async function getBillPresentment(input) {
  const blank = { status: 'unavailable', blocking: false, message: '', fields: [], outstanding: null };
  try {
    const { data } = await presentmentFn(input);
    return { ...blank, ...(data || {}) };
  } catch {
    return blank;
  }
}

/** Superadmin only: the catalogue with cost, sell and hidden state per package. */
export async function listSuccessTopUpCatalogForAdmin({ operator, operatorName, type, service }) {
  const { data } = await adminCatalogFn({ operator, operatorName, type, service });
  return {
    packages: data?.packages || [],
    driveWindowOpen: data?.driveWindowOpen !== false,
    driveWindowLabel: data?.driveWindowLabel || '',
  };
}

const pricingSaveFn = httpsCallable(functions, 'savePricingSettings');
const costCheckFn = httpsCallable(functions, 'getIimmpactCostCheck');

/** Superadmin: replaces MySheba's markup rules (settings/pricing.markups). */
export async function saveMarkups(markups) {
  await pricingSaveFn({ key: 'markups', value: markups });
}

/**
 * Superadmin: one IIMMPACT product's catalogue rate, its sale price for
 * `amount`, and the wholesale cost IIMMPACT recorded on recent orders.
 */
export async function getIimmpactCostCheck({ productCode, amount }) {
  return (await costCheckFn({ productCode, amount })).data;
}

const probePurchaseFn = httpsCallable(functions, 'probeIimmpactPurchase');

/**
 * Superadmin: sends IIMMPACT a purchase for a product that does not exist
 * (nothing can be charged) and returns its raw answers, to see why real
 * purchases are refused.
 */
export async function probeIimmpactPurchase(id) {
  return (await probePurchaseFn({ id })).data;
}
