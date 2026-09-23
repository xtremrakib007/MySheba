// Admin Web service for the platform's payment/collection details. Ported
// from the mobile app's src/firebase/paymentSettingsService.js: everything
// lives in ONE document, settings/paymentMethods — not in a `paymentMethods`
// collection. These are the JomPay biller details, the DuitNow QR and the
// receiving bank accounts a customer sees on the Top-Up screen.
//
// Superadmin-only to write (firestore.rules locks this doc id specifically),
// since these are the platform's real billing credentials.

import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const PAYMENT_SETTINGS_DOC = doc(db, 'settings', 'paymentMethods');

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface PaymentSettings {
  jompayBillerId: string;
  jompayRefNo: string;
  duitnowQrUrl: string;
  bankAccounts: BankAccount[];
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  jompayBillerId: '',
  jompayRefNo: '',
  duitnowQrUrl: '',
  bankAccounts: [],
};

export type PaymentSettingsKey = 'jompayBillerId' | 'jompayRefNo' | 'duitnowQrUrl';

function normalize(raw: Record<string, unknown> | undefined): PaymentSettings {
  const data = raw ?? {};
  return {
    ...DEFAULT_PAYMENT_SETTINGS,
    ...(data as Partial<PaymentSettings>),
    bankAccounts: Array.isArray(data.bankAccounts) ? (data.bankAccounts as BankAccount[]) : [],
  };
}

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  const snap = await getDoc(PAYMENT_SETTINGS_DOC);
  return normalize(snap.exists() ? snap.data() : undefined);
}

export function subscribePaymentSettings(
  onUpdate: (settings: PaymentSettings) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    PAYMENT_SETTINGS_DOC,
    (snap) => onUpdate(normalize(snap.exists() ? snap.data() : undefined)),
    (err) => onError(err as Error)
  );
}

/** Sets one of the single-value fields. */
export async function updatePaymentSettings(key: PaymentSettingsKey, value: string): Promise<void> {
  await setDoc(PAYMENT_SETTINGS_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}

// Bank accounts are read-modify-written rather than arrayUnion'd because each
// entry needs a generated id and per-entry edits, matching the mobile service.
async function writeBankAccounts(bankAccounts: BankAccount[]): Promise<void> {
  await setDoc(PAYMENT_SETTINGS_DOC, { bankAccounts, updatedAt: serverTimestamp() }, { merge: true });
}

export async function addBankAccount(account: Omit<BankAccount, 'id'>): Promise<void> {
  const current = await fetchPaymentSettings();
  await writeBankAccounts([...current.bankAccounts, { id: `bank-${Date.now()}`, ...account }]);
}

export async function updateBankAccount(id: string, updates: Partial<Omit<BankAccount, 'id'>>): Promise<void> {
  const current = await fetchPaymentSettings();
  await writeBankAccounts(current.bankAccounts.map((b) => (b.id === id ? { ...b, ...updates } : b)));
}

export async function removeBankAccount(id: string): Promise<void> {
  const current = await fetchPaymentSettings();
  await writeBankAccounts(current.bankAccounts.filter((b) => b.id !== id));
}
