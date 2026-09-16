// Next Update PRD §2 - Country/Region-Based Homepage.
//
// A single `settings/homepageConfig` document holds, per country code (the
// same codes src/data/countries.js already uses everywhere else - login
// dial-code picker, remittance/recharge destination), which homepage
// modules are enabled. Same one-doc shape as settings/pricing
// (settingsService.js) for the same reason: the home screen and the
// Superadmin > Homepage tab both just need a single subscribe.
//
// Malaysia (PRD: "Malaysia should continue using the existing service-first
// homepage") is the only country wired to the pre-existing layout by
// default; every other country - including any code not present in this
// for "other supported countries". A user with no `country` set on their
// profile (every account that existed before this feature, plus anyone who
// hasn't visited Profile > Country/Region yet) is treated as Malaysia, so
// CustomerHomeScreen's existing behavior is unchanged for them - see
// getHomepageLayout's default param below.
//
// Writes go straight through setDoc/merge, the same direct-client-write
// shape settingsService.updatePricing uses - not a Cloud Function, because
// unlike wallet/gift money this is display-only config with no balance or
// fraud surface. firestore.rules restricts settings/homepageConfig to
// superadmin the same way it already does settings/paymentMethods,
// settings/featureAccess and settings/progression.
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SETTINGS_DOC = doc(db, 'settings', 'homepageConfig');

// Modules a country's homepage can show. `layout` picks which
// CustomerHomeScreen body renders (see CustomerHomeScreen.js /
// without dropping it all the way back to the plain service grid.
// Lost&Found/Emergency/News) both render as their own section on
// both, or neither.
export const DEFAULT_MODULES = {
  showServices: true,
  showBanners: true,
};

export const MALAYSIA_MODULES = {
  ...DEFAULT_MODULES,
  layout: 'service',
};

// Seed shown in the admin UI / used before the doc has ever been saved -
// matches the PRD's two named starting points (MY service-first, everyone
// superadmin only needs to add an entry for a country once they want to
export const DEFAULT_HOMEPAGE_CONFIG = {
  MY: MALAYSIA_MODULES,
};

export function subscribeHomepageConfig(callback, onError) {
  return onSnapshot(SETTINGS_DOC, (snap) => {
    callback(snap.exists() ? { ...DEFAULT_HOMEPAGE_CONFIG, ...snap.data() } : DEFAULT_HOMEPAGE_CONFIG);
  }, onError);
}

/** Resolves which modules a given user's country should see, falling back
 * country on the profile at all) Malaysia's config, so legacy/not-yet-set
 * accounts keep today's homepage exactly as it is. */
export function getHomepageModules(homepageConfig, countryCode) {
  const config = homepageConfig || DEFAULT_HOMEPAGE_CONFIG;
  if (!countryCode) return config.MY || MALAYSIA_MODULES;
  return config[countryCode] || DEFAULT_MODULES;
}

/** Superadmin-only (enforced by firestore.rules). Merges `patch` into one
 * country's module config, creating the doc/country entry if this is the
 * first edit. */
export async function updateCountryModules(countryCode, patch) {
  await setDoc(SETTINGS_DOC, {
    [countryCode]: { ...patch },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
