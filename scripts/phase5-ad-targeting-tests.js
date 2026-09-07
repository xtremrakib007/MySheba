#!/usr/bin/env node
// PHASE 5 — MY SHEBA AD TARGETING ENGINE — acceptance tests.
//
// Runs with plain `node scripts/phase5-ad-targeting-tests.js` - no npm
// install, no Metro/Babel build step, no Firebase emulator. It works
// because it requires the SAME production matching code the app runs
// (src/utils/adTargetingRules.js + src/utils/adScheduleUtils.js), not a
// hand-copied re-implementation - see those two files' header comments
// for why they're zero-dependency CommonJS modules on purpose.
//
// src/firebase/adTargetingService.js's exported `matchesTargeting`/
// `getEligibleAds` are thin wrappers around exactly this logic (resolving
// an ad's effective status via adScheduleUtils, then delegating to
// adTargetingRules) - so what's verified here is what SmartAd.js actually
// calls at render time, not a parallel implementation.
//
// Run: node scripts/phase5-ad-targeting-tests.js

const path = require('path');
const { matchesTargeting } = require(path.join(__dirname, '../src/utils/adTargetingRules'));
const { getEffectiveAdStatus } = require(path.join(__dirname, '../src/utils/adScheduleUtils'));

// ---- test harness (no external test runner available/needed) ----

let pass = 0;
let fail = 0;
const failures = [];

function check(ad, context, expected, description) {
  const effectiveStatus = getEffectiveAdStatus(ad);
  const actual = matchesTargeting(ad, context, effectiveStatus);
  if (actual === expected) {
    pass += 1;
    console.log(`  ✓ ${description}`);
  } else {
    fail += 1;
    failures.push(description);
    console.log(`  ✗ ${description} — expected ${expected}, got ${actual}`);
  }
}

// ---- fixtures ----

const NOW = Date.now();
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;
const TOMORROW = NOW + 24 * 60 * 60 * 1000;

// A currently-live schedule every fixture ad below shares, unless a test
// is specifically about schedule/status itself (not this phase's job -
// PHASE 4 already covers that; these fixtures just need "definitely
// active right now" so targeting is the only variable under test).
const LIVE_SCHEDULE = { status: 'active', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) };

function baseAd(overrides) {
  return {
    adId: 'ad-1',
    name: 'Test Ad',
    adType: 'banner',
    placements: [],
    targetFeatures: [],
    targetCountries: [],
    targetStates: [],
    targetCities: [],
    targetAreas: [],
    targetOutlets: [],
    targetUserTypes: [],
    targetLanguages: [],
    ...LIVE_SCHEDULE,
    ...overrides,
  };
}

console.log('PHASE 5 — MY SHEBA AD TARGETING ENGINE — acceptance tests\n');

// ---- 1. Malaysia-only advertisement ----
console.log('1. Malaysia-only advertisement');
{
  const ad = baseAd({ targetCountries: ['MY'] });
  check(ad, { country: 'MY' }, true, 'Malaysia user sees a Malaysia-only ad');
  check(ad, { country: 'BD' }, false, 'Bangladesh user does NOT see a Malaysia-only ad');
  check(ad, {}, false, 'User with unknown country does NOT see a Malaysia-only ad (fails closed)');
}

// ---- 2. Bangladesh-only advertisement ----
console.log('\n2. Bangladesh-only advertisement');
{
  const ad = baseAd({ targetCountries: ['BD'] });
  check(ad, { country: 'BD' }, true, 'Bangladesh user sees a Bangladesh-only ad');
  check(ad, { country: 'MY' }, false, 'Malaysia user does NOT see a Bangladesh-only ad');
}

// ---- 3. Feature-only advertisement ----
console.log('\n3. Feature-only advertisement');
{
  const ad = baseAd({ targetFeatures: ['mobile_recharge'] });
  check(ad, { featureId: 'mobile_recharge', country: 'MY' }, true, 'Matching feature context sees a feature-only ad, regardless of country');
  check(ad, { featureId: 'mobile_recharge', country: 'BD' }, true, 'Matching feature context sees a feature-only ad from any country (country unrestricted)');
  check(ad, { featureId: 'remittance' }, false, 'Non-matching feature context does NOT see a feature-only ad');
}

// ---- 4. Language-only advertisement ----
console.log('\n4. Language-only advertisement');
{
  const ad = baseAd({ targetLanguages: ['bn'] });
  check(ad, { language: 'bn' }, true, 'Bangla-language user sees a Bangla-only ad');
  check(ad, { language: 'en' }, false, 'English-language user does NOT see a Bangla-only ad');
  check(ad, { language: 'ms' }, false, 'Malay-language user does NOT see a Bangla-only ad');
}

// ---- 5. User-type advertisement ----
console.log('\n5. User-type advertisement');
{
  const ad = baseAd({ targetUserTypes: ['dealer'] });
  check(ad, { userType: 'dealer' }, true, 'Dealer sees a dealer-only ad');
  check(ad, { userType: 'customer' }, false, 'Customer does NOT see a dealer-only ad');
  check(ad, {}, false, 'Unknown user type does NOT see a user-type-restricted ad (fails closed)');
}

// ---- 6. Unrestricted advertisement ----
console.log('\n6. Unrestricted advertisement');
{
  const ad = baseAd(); // every target* array left empty
  check(ad, { country: 'MY', userType: 'customer', language: 'en', featureId: 'home' }, true, 'Fully-specified context sees an unrestricted ad');
  check(ad, {}, true, 'Totally empty context still sees an unrestricted ad (nothing to fail closed on)');
  check(ad, { country: 'BD', userType: 'superadmin', language: 'ms' }, true, 'Any context at all sees an unrestricted ad');
}

// ---- 7. Multiple targeting conditions ----
console.log('\n7. Multiple targeting conditions (Malaysia + Mobile Recharge + Dealer + English)');
{
  const ad = baseAd({
    targetCountries: ['MY'],
    targetFeatures: ['mobile_recharge'],
    targetUserTypes: ['dealer'],
    targetLanguages: ['en'],
  });
  const fullMatch = { country: 'MY', featureId: 'mobile_recharge', userType: 'dealer', language: 'en' };
  check(ad, fullMatch, true, 'Context matching every condition sees the ad');
  check(ad, { ...fullMatch, country: 'BD' }, false, 'Wrong country alone fails the whole ad');
  check(ad, { ...fullMatch, featureId: 'remittance' }, false, 'Wrong feature alone fails the whole ad');
  check(ad, { ...fullMatch, userType: 'customer' }, false, 'Wrong user type alone fails the whole ad');
  check(ad, { ...fullMatch, language: 'bn' }, false, 'Wrong language alone fails the whole ad');
}

// ---- Placement + status/schedule still work (PHASE 4 regression) ----
console.log('\n8. Regression — placement + status/schedule targeting (PHASE 4) still work unaffected');
{
  const placedAd = baseAd({ placements: ['HOME_TOP'] });
  check(placedAd, { placementId: 'HOME_TOP' }, true, 'Ad matches its own placement');
  check(placedAd, { placementId: 'HOME_BOTTOM' }, false, 'Ad does not match a different placement');

  const expiredAd = baseAd({ status: 'active', startAt: new Date(YESTERDAY - 1000), endAt: new Date(YESTERDAY) });
  check(expiredAd, {}, false, 'An ad whose endAt has passed is not eligible even with no targeting restrictions');

  const scheduledAd = baseAd({ status: 'active', startAt: new Date(TOMORROW), endAt: new Date(TOMORROW + 1000) });
  check(scheduledAd, {}, false, 'An ad whose startAt has not arrived yet is not eligible');

  const pausedAd = baseAd({ status: 'paused' });
  check(pausedAd, {}, false, 'A manually paused ad is not eligible regardless of schedule');
}

// ---- Existing features unaffected — a plain, fully-unrestricted feature-
// only ad (the shape PHASE 4's own ads already used) still behaves
// exactly as it did before this phase. ----
console.log('\n9. Regression — pre-existing PHASE 4-style feature-only ad unaffected by PHASE 5');
{
  const legacyAd = baseAd({ placements: ['RECHARGE_TOP'], targetFeatures: ['mobile_recharge'] });
  check(legacyAd, { placementId: 'RECHARGE_TOP', featureId: 'mobile_recharge' }, true, 'Legacy placement+feature-only ad still matches its own slot');
  check(legacyAd, { placementId: 'RECHARGE_TOP', featureId: 'remittance' }, false, 'Legacy placement+feature-only ad still excludes a different feature');
}

// ---- summary ----
console.log(`\n${'-'.repeat(60)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailed:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log('All PHASE 5 acceptance tests passed.');
}
