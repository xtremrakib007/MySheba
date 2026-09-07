// A single `settings/paymentMethods` document holds the platform's JomPay
// biller details, DuitNow QR code, and receiving bank account list - the
// payment options a customer sees on the Top-Up screen (see
// TopUpScreen.js / SuperAdminTopUpScreen.js). Superadmin-only to edit (see
// firestore.rules' settings/{id} write rule - this doc id is locked to
// isSuperadmin() specifically, unlike the rest of the settings/ collection
// which any admin can edit) since these are the platform's actual billing
// credentials, not a day-to-day pricing knob a regular admin should touch.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const PAYMENT_SETTINGS_DOC = doc(db, 'settings', 'paymentMethods');

export const DEFAULT_PAYMENT_SETTINGS = {
  jompayBillerId: '',
  jompayRefNo: '',
  duitnowQrUrl: '',
  // Each entry: { id, bankName, accountNumber, accountHolder }. Shown to
  // customers on the Top-Up screen when they pick Bank Transfer/Bank
  // Deposit, so they know which account to send money to.
  bankAccounts: [],
};

/** Ensures the settings doc exists (first run) then returns current values. */
export async function ensurePaymentSettings() {
  const snap = await getDoc(PAYMENT_SETTINGS_DOC);
  if (!snap.exists()) {
    await setDoc(PAYMENT_SETTINGS_DOC, { ...DEFAULT_PAYMENT_SETTINGS, updatedAt: serverTimestamp() });
    return { ...DEFAULT_PAYMENT_SETTINGS };
  }
  return { ...DEFAULT_PAYMENT_SETTINGS, ...snap.data() };
}

export function subscribePaymentSettings(callback, onError) {
  return onSnapshot(
    PAYMENT_SETTINGS_DOC,
    (snap) => callback(snap.exists() ? { ...DEFAULT_PAYMENT_SETTINGS, ...snap.data() } : DEFAULT_PAYMENT_SETTINGS),
    onError
  );
}

/** Sets one field (jompayBillerId | jompayRefNo | duitnowQrUrl). Superadmin-only in the UI and in firestore.rules. */
export async function updatePaymentSettings(key, value) {
  await setDoc(PAYMENT_SETTINGS_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Adds one receiving bank account to the list shown on the Top-Up screen
 * for Bank Transfer/Bank Deposit. Read-modify-write (rather than
 * arrayUnion) because entries need a generated `id` and later
 * per-entry edits/removals, not just append/exact-match removal.
 * @param {{ bankName: string, accountNumber: string, accountHolder: string }} account
 */
export async function addBankAccount(account) {
  const current = await ensurePaymentSettings();
  const bankAccounts = [...(current.bankAccounts || []), { id: `bank-${Date.now()}`, ...account }];
  await setDoc(PAYMENT_SETTINGS_DOC, { bankAccounts, updatedAt: serverTimestamp() }, { merge: true });
}

/** Updates one bank account entry by id. */
export async function updateBankAccount(id, updates) {
  const current = await ensurePaymentSettings();
  const bankAccounts = (current.bankAccounts || []).map((b) => (b.id === id ? { ...b, ...updates } : b));
  await setDoc(PAYMENT_SETTINGS_DOC, { bankAccounts, updatedAt: serverTimestamp() }, { merge: true });
}

/** Removes one bank account entry by id. */
export async function removeBankAccount(id) {
  const current = await ensurePaymentSettings();
  const bankAccounts = (current.bankAccounts || []).filter((b) => b.id !== id);
  await setDoc(PAYMENT_SETTINGS_DOC, { bankAccounts, updatedAt: serverTimestamp() }, { merge: true });
}
