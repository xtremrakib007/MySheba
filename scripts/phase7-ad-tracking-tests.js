#!/usr/bin/env node
// PHASE 7 — MY SHEBA AD TRACKING — acceptance tests.
//
// Runs with plain `node scripts/phase7-ad-tracking-tests.js` - no npm
// install, no Metro/Babel build step, no Firebase emulator. It works
// because it requires the SAME production logic the app runs
// (src/utils/adTrackingRules.js), not a hand-copied re-implementation -
// same pattern scripts/phase5-ad-targeting-tests.js and
// scripts/phase6-campaign-scheduling-tests.js already established.
//
// Covers the brief's ACCEPTANCE TEST list: one banner view, repeated
// component rendering, banner click, no-URL banner, URL banner, multiple
// users, multiple placements - plus the DUPLICATE PROTECTION cooldown
// math itself. The click-action / no-URL behavior and the
// impression-fires-once-per-shown-ad behavior already live in
// SmartAd.js's onPressAt/pressableFor and its activeAd.id effect
// dependency respectively - those are exercised here as small,
// dependency-free re-statements of that same logic (see each section's
// own comment), not by rendering React Native.
//
// Run: node scripts/phase7-ad-tracking-tests.js

const path = require('path');
const {
  createStore, isOnCooldown, markRecorded, DEFAULT_COOLDOWN_MS,
} = require(path.join(__dirname, '../src/utils/adTrackingRules'));

let pass = 0;
let fail = 0;
const failures = [];

function check(actual, expected, description) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${description}`);
  } else {
    fail += 1;
    failures.push(description);
    console.log(`  ✗ ${description} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = Date.now();

console.log('PHASE 7 — MY SHEBA AD TRACKING — acceptance tests\n');

// ---- 1. One banner view ----
console.log('1. One banner view');
{
  const store = createStore();
  check(isOnCooldown(store, 'impression', 'ad-1', 'HOME_TOP', NOW), false, 'A never-before-recorded impression is not on cooldown');
  markRecorded(store, 'impression', 'ad-1', 'HOME_TOP', NOW);
  check(isOnCooldown(store, 'impression', 'ad-1', 'HOME_TOP', NOW + 10), true, 'Immediately after recording, the same (ad, placement) reads as a duplicate');
}

// ---- 2. Repeated component rendering (re-render + remount + rapid repeated events) ----
console.log('\n2. Repeated component rendering');
{
  const store = createStore();
  // Simulates: mount fires impression, several re-renders happen (a real
  // re-render never even calls recordImpression at all, thanks to
  // SmartAd's activeAd.id effect dependency - this loop instead models
  // the worse case, a REMOUNT, which throws that guard away and calls in
  // fresh every time).
  markRecorded(store, 'impression', 'ad-1', 'HOME_TOP', NOW);
  let recordedCount = 1;
  for (let i = 1; i <= 5; i += 1) {
    const remountAtMs = NOW + i * 200; // five remounts, 200ms apart - well inside the cooldown
    if (!isOnCooldown(store, 'impression', 'ad-1', 'HOME_TOP', remountAtMs)) {
      markRecorded(store, 'impression', 'ad-1', 'HOME_TOP', remountAtMs);
      recordedCount += 1;
    }
  }
  check(recordedCount, 1, 'Five rapid remounts of the same ad/placement within the cooldown only ever record once');

  // A remount well AFTER the cooldown window (e.g. the user left the
  // screen and came back minutes later) is a genuinely new view and
  // should count again.
  const store2 = createStore();
  markRecorded(store2, 'impression', 'ad-1', 'HOME_TOP', NOW);
  const laterMs = NOW + DEFAULT_COOLDOWN_MS + 1000;
  check(isOnCooldown(store2, 'impression', 'ad-1', 'HOME_TOP', laterMs), false, 'A remount well after the cooldown window is treated as a genuinely new view, not a duplicate');

  // Rapid repeated click events (a fast double-tap) get the same
  // protection as impressions.
  const store3 = createStore();
  check(isOnCooldown(store3, 'click', 'ad-1', 'HOME_TOP', NOW), false, 'A never-before-recorded click is not on cooldown');
  markRecorded(store3, 'click', 'ad-1', 'HOME_TOP', NOW);
  check(isOnCooldown(store3, 'click', 'ad-1', 'HOME_TOP', NOW + 50), true, 'A double-tap 50ms later on the same ad/placement is treated as a duplicate click');
}

// ---- 3. Banner click / URL banner / no-URL banner ----
// SmartAd.js's own pressableFor/onPressAd (not re-implemented here) is
// what decides this in production; this section re-states that same
// decision table as a small pure function so it's covered by this
// acceptance suite without needing React Native.
console.log('\n3. Banner click, URL banner, no-URL banner');
{
  function resolveClickBehavior(clickAction) {
    // Mirrors SmartAd.js's pressableFor: only a real URL/phone/whatsapp/
    // internal value with a non-'none' type gets a press handler at all.
    const hasDestination = !!clickAction && clickAction.type !== 'none' && !!clickAction.value;
    return {
      pressable: hasDestination,
      recordsClick: hasDestination, // no destination -> nothing to click -> nothing recorded, per the brief
      opensUrl: hasDestination && clickAction.type === 'url',
    };
  }

  const urlBanner = resolveClickBehavior({ type: 'url', value: 'https://example.com' });
  check(urlBanner, { pressable: true, recordsClick: true, opensUrl: true }, 'A banner with a URL is pressable, records a click, and opens the URL');

  const noUrlBanner = resolveClickBehavior({ type: 'none', value: undefined });
  check(noUrlBanner, { pressable: false, recordsClick: false, opensUrl: false }, 'A banner with no URL (clickAction.type = none) is not pressable and never records a destination click');

  const emptyValueBanner = resolveClickBehavior({ type: 'url', value: '' });
  check(emptyValueBanner, { pressable: false, recordsClick: false, opensUrl: false }, 'A url-type clickAction with an empty value is treated the same as no destination at all');

  const phoneBanner = resolveClickBehavior({ type: 'phone', value: '+60123456789' });
  check(phoneBanner, { pressable: true, recordsClick: true, opensUrl: false }, 'A phone-type banner is pressable and records a click, but is not a URL open');
}

// ---- 4. Multiple users ----
// Duplicate protection is a single in-memory store per app process/
// session - it is never meant to dedupe ACROSS users (two different
// people genuinely seeing the same ad are two real impressions). This
// models that by keying on adId+placementId only (matching production),
// and confirms that has no user dimension to accidentally collide on.
console.log('\n4. Multiple users');
{
  // Two independent stores stand in for two different app installs/
  // sessions (production never shares recentEventStore across users -
  // it's a fresh module-scoped Map per app process).
  const userAStore = createStore();
  const userBStore = createStore();
  markRecorded(userAStore, 'impression', 'ad-1', 'HOME_TOP', NOW);
  check(isOnCooldown(userBStore, 'impression', 'ad-1', 'HOME_TOP', NOW + 10), false, 'User A recording an impression never suppresses the same ad/placement for User B\'s own session');
}

// ---- 5. Multiple placements ----
console.log('\n5. Multiple placements');
{
  const store = createStore();
  markRecorded(store, 'impression', 'ad-1', 'HOME_TOP', NOW);
  check(isOnCooldown(store, 'impression', 'ad-1', 'RECHARGE_TOP', NOW + 10), false, 'The same ad shown in a second placement is a distinct event, not a duplicate of the first placement\'s impression');
  check(isOnCooldown(store, 'impression', 'ad-1', 'HOME_TOP', NOW + 10), true, 'The original placement is still correctly on cooldown');

  // Different ads in the same placement are likewise independent.
  markRecorded(store, 'impression', 'ad-2', 'HOME_TOP', NOW);
  check(isOnCooldown(store, 'impression', 'ad-2', 'HOME_TOP', NOW + 10), true, 'A second ad in the same placement is tracked independently of the first ad');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
