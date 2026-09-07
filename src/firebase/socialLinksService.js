// A single `settings/social` document holds two things admins manage from
// Admin > Social (see AdminHomeScreen.js):
//  1. The platform's official social media links, shown on the customer
//     Support screen's "Follow us" row - blank fields just don't render
//     a button there, same "Coming soon" idea as supportContactService.js's
//     phone/whatsapp.
//  2. facebookAppId - a Meta developer App ID (free to create, no App
//     Review needed just for Story sharing), required by
//     ShareListingSheet.js to attribute Instagram/Facebook Story shares.
//     Not a link - kept in this same doc purely to avoid a second
//     Firestore read on every screen that needs the social links.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SOCIAL_DOC = doc(db, 'settings', 'social');

export const DEFAULT_SOCIAL_LINKS = {
  facebook: '',
  instagram: '',
  tiktok: '',
  linkedin: '',
  x: '',
  facebookAppId: '',
};

/** Ensures the settings doc exists (first run) then returns current values. */
export async function ensureSocialLinks() {
  const snap = await getDoc(SOCIAL_DOC);
  if (!snap.exists()) {
    await setDoc(SOCIAL_DOC, { ...DEFAULT_SOCIAL_LINKS, updatedAt: serverTimestamp() });
    return { ...DEFAULT_SOCIAL_LINKS };
  }
  return { ...DEFAULT_SOCIAL_LINKS, ...snap.data() };
}

export function subscribeSocialLinks(callback, onError) {
  return onSnapshot(
    SOCIAL_DOC,
    (snap) => callback(snap.exists() ? { ...DEFAULT_SOCIAL_LINKS, ...snap.data() } : DEFAULT_SOCIAL_LINKS),
    onError
  );
}

export async function updateSocialLink(key, value) {
  await setDoc(SOCIAL_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}
