// A single `settings/support` document holds the admin-editable Call and
// WhatsApp support numbers shown on the customer Support screen. Both start
// blank - admin fills them in later from Admin > Support once the real
// numbers are ready. Until then the Support screen shows those two options
// as "Coming soon" instead of dialing/opening a placeholder number.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SUPPORT_DOC = doc(db, 'settings', 'support');

export const DEFAULT_SUPPORT_CONTACT = {
  phone: '',    // e.g. +60312345678 - used for the Call option (tel: link)
  whatsapp: '', // digits only, no + or leading zeros - wa.me format
};

/** Ensures the settings doc exists (first run) then returns current values. */
export async function ensureSupportContact() {
  const snap = await getDoc(SUPPORT_DOC);
  if (!snap.exists()) {
    await setDoc(SUPPORT_DOC, { ...DEFAULT_SUPPORT_CONTACT, updatedAt: serverTimestamp() });
    return { ...DEFAULT_SUPPORT_CONTACT };
  }
  return { ...DEFAULT_SUPPORT_CONTACT, ...snap.data() };
}

export function subscribeSupportContact(callback, onError) {
  return onSnapshot(
    SUPPORT_DOC,
    (snap) => callback(snap.exists() ? { ...DEFAULT_SUPPORT_CONTACT, ...snap.data() } : DEFAULT_SUPPORT_CONTACT),
    onError
  );
}

export async function updateSupportContact(key, value) {
  await setDoc(SUPPORT_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}
