// Finance-first homepage configuration.
// Customer accounts use the service homepage by default. Legacy social/community
// screens remain available to existing internal/admin routes, but they are no
// longer selected as the normal customer homepage.
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SETTINGS_DOC = doc(db, 'settings', 'homepageConfig');

export const DEFAULT_MODULES = {
  layout: 'service',
  showServices: true,
  showCommunityFeed: false,
  showSocialFeed: false,
  showBanners: true,
};

export const MALAYSIA_MODULES = { ...DEFAULT_MODULES };

export const DEFAULT_HOMEPAGE_CONFIG = {
  MY: MALAYSIA_MODULES,
};

export function subscribeHomepageConfig(callback, onError) {
  return onSnapshot(SETTINGS_DOC, (snap) => {
    callback(snap.exists() ? { ...DEFAULT_HOMEPAGE_CONFIG, ...snap.data() } : DEFAULT_HOMEPAGE_CONFIG);
  }, onError);
}

export function getHomepageModules(homepageConfig, countryCode) {
  const config = homepageConfig || DEFAULT_HOMEPAGE_CONFIG;
  const modules = (countryCode && config[countryCode]) || config.MY || DEFAULT_MODULES;
  return { ...DEFAULT_MODULES, ...modules, layout: 'service', showCommunityFeed: false, showSocialFeed: false };
}

export async function updateCountryModules(countryCode, patch) {
  await setDoc(SETTINGS_DOC, {
    [countryCode]: { ...patch },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
