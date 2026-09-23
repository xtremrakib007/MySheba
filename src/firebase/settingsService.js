// A single `settings/pricing` document holds the platform's editable money
// rules that don't fit into `rates/current` (exchange rates) or a specific
// package list. Kept as one doc for the same reason ratesService.js does -
// the Admin > Pricing tab and anything that needs a value (point transfer,
// recharge checkout) can subscribe with a single read.
import { doc, getDoc, setDoc, deleteField, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SETTINGS_DOC = doc(db, 'settings', 'pricing');

export const ROLE_PRICE_ROLES = ['customer', 'dealer', 'reseller', 'admin'];

export const ROLE_PRICE_KEYS = ['webviewAccessCost', 'webviewSubmitCost', 'paymentSuccessCost', 'notepadCost', 'myDocumentsCost', 'salaryOtCost', 'rechargePointCostPerUnit', 'internetPointCostPerUnit'];

export const DEFAULT_PRICING = {
  dealerEarningPercent: 1.5,
  rechargeCostPercent: 95,
  rechargeProfitPercent: 5,
  rechargePointCostPerUnit: 1,
  internetPointCostPerUnit: 1,
  webviewAccessCost: 2,
  webviewSubmitCost: 2,
  paymentSuccessCost: 3,
  notepadCost: 0,
  myDocumentsCost: 0,
  salaryOtCost: 0,
  moduleSubscriptionDays: 30,
  webviewAccessWindowHours: 1,
  rolePricing: {},
};

export function priceForRole(pricing, key, role) {
  const override = role && pricing?.rolePricing?.[role]?.[key];
  return override != null ? override : pricing?.[key];
}

export async function updateRolePrice(role, key, value) {
  if (!ROLE_PRICE_ROLES.includes(role)) throw new Error('Unknown role.');
  if (!ROLE_PRICE_KEYS.includes(key)) throw new Error('Unknown price key.');
  const path = `rolePricing.${role}.${key}`;
  if (value === null) {
    await setDoc(SETTINGS_DOC, { [path]: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new Error('Enter a valid price.');
  await setDoc(SETTINGS_DOC, { [path]: num, updatedAt: serverTimestamp() }, { merge: true });
}

export async function ensurePricing() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) {
    await setDoc(SETTINGS_DOC, { ...DEFAULT_PRICING, updatedAt: serverTimestamp() });
    return { ...DEFAULT_PRICING };
  }
  return { ...DEFAULT_PRICING, ...snap.data() };
}

export function subscribePricing(callback, onError) {
  return onSnapshot(
    SETTINGS_DOC,
    (snap) => callback(snap.exists() ? { ...DEFAULT_PRICING, ...snap.data() } : DEFAULT_PRICING),
    onError
  );
}

export async function updatePricing(key, value) {
  await setDoc(SETTINGS_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}
