// Admin Web service for settings/pricing — mirrors the mobile app's
// src/firebase/settingsService.js exactly (same doc, same field names,
// same defaults, same role-override shape). Kept in its own file/page,
// separate from Rates (rates/current — exchange rates), since the
// mobile app itself treats these as two separate screens (Admin >
// Rates vs Admin > Pricing).

import { deleteField, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const SETTINGS_DOC = doc(db, 'settings', 'pricing');

export const ROLE_PRICE_ROLES = ['customer', 'subdealer', 'dealer', 'reseller', 'admin'] as const;
export type PricingRole = (typeof ROLE_PRICE_ROLES)[number];

export const ROLE_PRICE_KEYS = [
  'webviewAccessCost',
  'webviewSubmitCost',
  'paymentSuccessCost',
  'listingBoostCost',
  'notepadCost',
  'myDocumentsCost',
  'salaryOtCost',
  'rechargePointCostPerUnit',
  'internetPointCostPerUnit',
  'gamePointsCostPerUnit',
] as const;
export type RolePriceKey = (typeof ROLE_PRICE_KEYS)[number];

export interface PricingSettings {
  dealerEarningPercent: number;
  rechargeCostPercent: number;
  rechargeProfitPercent: number;
  rechargePointCostPerUnit: number;
  internetPointCostPerUnit: number;
  gamePointsCostPerUnit: number;
  webviewAccessCost: number;
  webviewSubmitCost: number;
  paymentSuccessCost: number;
  notepadCost: number;
  myDocumentsCost: number;
  salaryOtCost: number;
  moduleSubscriptionDays: number;
  webviewAccessWindowHours: number;
  listingBoostCost: number;
  listingBoostDurationDays: number;
  gamePointsFeePercent: number;
  rolePricing: Partial<Record<PricingRole, Partial<Record<RolePriceKey, number>>>>;
}

export const DEFAULT_PRICING: PricingSettings = {
  dealerEarningPercent: 1.5,
  rechargeCostPercent: 95,
  rechargeProfitPercent: 5,
  rechargePointCostPerUnit: 1,
  internetPointCostPerUnit: 1,
  gamePointsCostPerUnit: 1,
  webviewAccessCost: 2,
  webviewSubmitCost: 2,
  paymentSuccessCost: 3,
  notepadCost: 0,
  myDocumentsCost: 0,
  salaryOtCost: 0,
  moduleSubscriptionDays: 30,
  webviewAccessWindowHours: 1,
  listingBoostCost: 5,
  listingBoostDurationDays: 7,
  gamePointsFeePercent: 10,
  rolePricing: {},
};

export async function fetchPricing(): Promise<PricingSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return { ...DEFAULT_PRICING, ...(snap.exists() ? (snap.data() as Partial<PricingSettings>) : {}) };
}

export async function updatePricing(key: keyof PricingSettings, value: number): Promise<void> {
  await setDoc(SETTINGS_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}

/** Superadmin-only in the UI, matching the mobile app's AdminHomeScreen
 * gate — firestore.rules itself allows a plain admin to write settings/
 * pricing EXCEPT the rolePricing field, which only isSuperadmin() can
 * touch, so this must stay restricted client-side too even though the
 * rest of the page isn't. */
export async function updateRolePrice(
  role: PricingRole,
  key: RolePriceKey,
  value: number | null
): Promise<void> {
  const path = `rolePricing.${role}.${key}`;
  if (value === null) {
    await setDoc(SETTINGS_DOC, { [path]: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  await setDoc(SETTINGS_DOC, { [path]: value, updatedAt: serverTimestamp() }, { merge: true });
}
