// Admin Web service for settings/pricing — mirrors the mobile app's
// src/firebase/settingsService.js exactly (same doc, same field names,
// same defaults, same role-override shape). Kept in its own file/page,
// separate from Rates (rates/current — exchange rates).

import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth } from '../firebase/config';
import { db, functions } from '../firebase/config';

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

export interface CatalogProductPrice {
  id: string;
  service: string;
  country: string;
  operator: string;
  productId: string;
  productName: string;
  costPrice: number;
  currency: string;
  active: boolean;
  prices: Partial<Record<PricingRole, number>>;
  commissions: Partial<Record<PricingRole, { type: 'fixed' | 'percent'; value: number }>>;
}

export interface CommissionTier {
  minAmount: number;
  maxAmount: number | null;
  fee: number;
}

export interface CommissionRules {
  recharge: { type: 'fixed' | 'percent'; value: number };
  internet: { type: 'fixed' | 'percent'; value: number };
  billTiers: CommissionTier[];
  remittanceTiers: CommissionTier[];
  touchNGoFeePercent: number;
}

export interface PricingSettings {
  dealerEarningPercent: number;
  rechargeCostPercent: number;
  rechargeProfitPercent: number;
  rechargePointCostPerUnit: number;
  internetPointCostPerUnit: number;
  offerPacksPointCostPerUnit: number;
  entertainmentPointCostPerUnit: number;
  webviewAccessCost: number;
  webviewSubmitCost: number;
  paymentSuccessCost: number;
  notepadCost: number;
  myDocumentsCost: number;
  salaryOtCost: number;
  moduleSubscriptionDays: number;
  webviewAccessWindowHours: number;
  rolePricing: Partial<Record<PricingRole, Partial<Record<RolePriceKey, number>>>>;
  catalogProductPricing: CatalogProductPrice[];
  commissionRules: CommissionRules;
}

export const DEFAULT_PRICING: PricingSettings = {
  dealerEarningPercent: 1.5,
  rechargeCostPercent: 95,
  rechargeProfitPercent: 5,
  rechargePointCostPerUnit: 1,
  internetPointCostPerUnit: 1,
  offerPacksPointCostPerUnit: 1,
  entertainmentPointCostPerUnit: 1,
  webviewAccessCost: 2,
  webviewSubmitCost: 2,
  paymentSuccessCost: 3,
  notepadCost: 0,
  myDocumentsCost: 0,
  salaryOtCost: 0,
  moduleSubscriptionDays: 30,
  webviewAccessWindowHours: 1,
  rolePricing: {},
  catalogProductPricing: [],
  commissionRules: {
    recharge: { type: 'fixed', value: 0 },
    internet: { type: 'fixed', value: 0 },
    billTiers: [{ minAmount: 10, maxAmount: 50, fee: 0.10 }, { minAmount: 50.01, maxAmount: null, fee: 0.20 }],
    remittanceTiers: [{ minAmount: 1, maxAmount: 999, fee: 10 }, { minAmount: 1000, maxAmount: 1999, fee: 15 }, { minAmount: 2000, maxAmount: null, fee: 20 }],
    touchNGoFeePercent: 0.5,
  },
};

export async function fetchPricing(): Promise<PricingSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  const data = snap.exists() ? (snap.data() as Partial<PricingSettings>) : {};
  return { ...DEFAULT_PRICING, ...data, catalogProductPricing: Array.isArray(data.catalogProductPricing) ? data.catalogProductPricing : [], commissionRules: { ...DEFAULT_PRICING.commissionRules, ...(data.commissionRules || {}), recharge: { ...DEFAULT_PRICING.commissionRules.recharge, ...(data.commissionRules?.recharge || {}) }, internet: { ...DEFAULT_PRICING.commissionRules.internet, ...(data.commissionRules?.internet || {}) }, billTiers: Array.isArray(data.commissionRules?.billTiers) ? data.commissionRules.billTiers : DEFAULT_PRICING.commissionRules.billTiers, remittanceTiers: Array.isArray(data.commissionRules?.remittanceTiers) ? data.commissionRules.remittanceTiers : DEFAULT_PRICING.commissionRules.remittanceTiers } };
}

export async function updatePricing(key: keyof PricingSettings, value: PricingSettings[keyof PricingSettings]): Promise<void> {
  const fn = httpsCallable(functions, 'savePricingSettings');
  await fn({ key: String(key), value });
}

export async function updateRolePrice(
  role: PricingRole,
  key: RolePriceKey,
  value: number | null
): Promise<void> {
  const current = await fetchPricing();
  const rolePricing = { ...(current.rolePricing || {}) };
  const roleValues = { ...(rolePricing[role] || {}) } as Partial<Record<RolePriceKey, number>>;
  if (value === null) delete roleValues[key]; else roleValues[key] = value;
  rolePricing[role] = roleValues;
  await updatePricing('rolePricing', rolePricing);
}

export async function saveCatalogProductPrice(entry: CatalogProductPrice): Promise<void> {
  const current = await fetchPricing();
  const list = current.catalogProductPricing.filter((item) => item.id !== entry.id);
  list.push({ ...entry, service: entry.service.trim(), country: entry.country.trim().toUpperCase(), operator: entry.operator.trim(), productId: entry.productId.trim(), productName: entry.productName.trim(), currency: entry.currency.trim().toUpperCase() || 'MYR' });
  await updatePricing('catalogProductPricing', list);
}

export async function deleteCatalogProductPrice(id: string): Promise<void> {
  const current = await fetchPricing();
  await updatePricing('catalogProductPricing', current.catalogProductPricing.filter((item) => item.id !== id));
}
