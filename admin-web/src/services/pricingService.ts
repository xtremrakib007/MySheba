// Admin Web service for settings/pricing — mirrors the mobile app's
// src/firebase/settingsService.js exactly (same doc, same field names,
// same defaults, same role-override shape). Kept in its own file/page,
// separate from Rates (rates/current — exchange rates).

import { deleteField, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const SETTINGS_DOC = doc(db, 'settings', 'pricing');

export const ROLE_PRICE_ROLES = ['customer', 'retail', 'dealer', 'reseller', 'admin'] as const;
export type PricingRole = (typeof ROLE_PRICE_ROLES)[number];

export const ROLE_LABELS: Record<PricingRole, string> = { customer: 'Customer', retail: 'Retail', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin' };

export const ROLE_PRICE_KEYS = [
  'webviewAccessCost',
  'webviewSubmitCost',
  'paymentSuccessCost',
  'notepadCost',
  'myDocumentsCost',
  'salaryOtCost',
  'rechargePointCostPerUnit',
  'internetPointCostPerUnit',
] as const;
export type RolePriceKey = (typeof ROLE_PRICE_KEYS)[number];

export interface PricingSettings {
  dealerEarningPercent: number;
  rechargeCostPercent: number;
  rechargeProfitPercent: number;
  rechargePointCostPerUnit: number;
  internetPointCostPerUnit: number;
  webviewAccessCost: number;
  webviewSubmitCost: number;
  paymentSuccessCost: number;
  notepadCost: number;
  myDocumentsCost: number;
  salaryOtCost: number;
  moduleSubscriptionDays: number;
  webviewAccessWindowHours: number;
  rolePricing: Partial<Record<PricingRole, Partial<Record<RolePriceKey, number>>>>;
}

export const DEFAULT_PRICING: PricingSettings = {
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

export async function fetchPricing(): Promise<PricingSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  return { ...DEFAULT_PRICING, ...(snap.exists() ? (snap.data() as Partial<PricingSettings>) : {}) };
}

export async function updatePricing(key: keyof PricingSettings, value: number): Promise<void> {
  await setDoc(SETTINGS_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}

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
