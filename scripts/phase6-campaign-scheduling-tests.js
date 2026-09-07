#!/usr/bin/env node
// PHASE 6 — MY SHEBA CAMPAIGN SCHEDULING AND ROTATION — acceptance tests.
//
// Runs with plain `node scripts/phase6-campaign-scheduling-tests.js` - no
// npm install, no Metro/Babel build step, no Firebase emulator. It works
// because it requires the SAME production logic the app runs
// (src/utils/adScheduleUtils.js, src/utils/adRotationRules.js,
// src/utils/adFrequencyRules.js), not a hand-copied re-implementation -
// same pattern scripts/phase5-ad-targeting-tests.js already established.
//
// Covers the brief's ACCEPTANCE TEST list: scheduled advertisement,
// expired advertisement, paused advertisement, priority, weighted
// rotation, frequency limits - plus the STATUS AUTOMATION matrix itself.
//
// Run: node scripts/phase6-campaign-scheduling-tests.js

const path = require('path');
const { getEffectiveAdStatus } = require(path.join(__dirname, '../src/utils/adScheduleUtils'));
const {
  topPriorityTier, weightedPick, weightedShuffle, rotationCap,
  selectAdForPlacement, getRotationForPlacement,
} = require(path.join(__dirname, '../src/utils/adRotationRules'));
const {
  isUnderImpressionCap, isUnderClickCap, isUnderInterstitialHourlyCap, startOfUtcDay,
} = require(path.join(__dirname, '../src/utils/adFrequencyRules'));

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
const YESTERDAY = NOW - 24 * 60 * 60 * 1000;
const TOMORROW = NOW + 24 * 60 * 60 * 1000;
const NEXT_WEEK = NOW + 7 * 24 * 60 * 60 * 1000;
const LAST_WEEK = NOW - 7 * 24 * 60 * 60 * 1000;

function ad(overrides) {
  return { adId: 'ad-1', priority: 0, weight: 1, ...overrides };
}

console.log('PHASE 6 — MY SHEBA CAMPAIGN SCHEDULING AND ROTATION — acceptance tests\n');

// ---- 1. STATUS AUTOMATION ----
console.log('1. Status automation');
{
  check(getEffectiveAdStatus(ad({ status: 'approved', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'active', 'Approved ad within its schedule reads as active');
  check(getEffectiveAdStatus(ad({ status: 'approved', startAt: new Date(TOMORROW), endAt: new Date(NEXT_WEEK) })), 'scheduled', 'Approved ad whose start date has not arrived reads as scheduled');
  check(getEffectiveAdStatus(ad({ status: 'scheduled', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'active', 'Scheduled ad whose start date has arrived reads as active');
  check(getEffectiveAdStatus(ad({ status: 'active', startAt: new Date(LAST_WEEK), endAt: new Date(YESTERDAY) })), 'expired', 'Active ad whose end date has passed reads as expired');
  check(getEffectiveAdStatus(ad({ status: 'paused', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'paused', 'Paused ad stays paused even mid-schedule (manual status overrides schedule)');
  check(getEffectiveAdStatus(ad({ status: 'draft', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'draft', 'Draft ad never auto-activates from its dates alone');
  check(getEffectiveAdStatus(ad({ status: 'pending_approval', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'pending_approval', 'Pending-approval ad never auto-activates - "approved" is required');
  check(getEffectiveAdStatus(ad({ status: 'rejected', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'rejected', 'Rejected ad never auto-activates');
  check(getEffectiveAdStatus(ad({ status: 'archived', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) })), 'archived', 'Archived ad never auto-activates');
}

// ---- 2. Scheduled advertisement (not live yet) ----
console.log('\n2. Scheduled advertisement');
{
  const scheduledAd = ad({ status: 'approved', startAt: new Date(TOMORROW), endAt: new Date(NEXT_WEEK) });
  check(getEffectiveAdStatus(scheduledAd), 'scheduled', 'An ad scheduled for the future is not effectively active yet');
}

// ---- 3. Expired advertisement ----
console.log('\n3. Expired advertisement');
{
  const expiredAd = ad({ status: 'active', startAt: new Date(LAST_WEEK), endAt: new Date(YESTERDAY) });
  check(getEffectiveAdStatus(expiredAd), 'expired', 'An ad whose end date already passed is expired, regardless of its stored status');
}

// ---- 4. Paused advertisement ----
console.log('\n4. Paused advertisement');
{
  const pausedAd = ad({ status: 'paused', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) });
  check(getEffectiveAdStatus(pausedAd), 'paused', 'A paused ad never shows, even squarely inside its own schedule window');
}

// ---- 5. Priority ----
console.log('\n5. Priority');
{
  const low = ad({ adId: 'low', priority: 1, weight: 1000 });
  const high = ad({ adId: 'high', priority: 5, weight: 1 });
  const tier = topPriorityTier([low, high]);
  check(tier.map((a) => a.adId), ['high'], 'Higher priority wins outright, no matter how large the lower-priority ad\'s weight is');
  check(topPriorityTier([]), [], 'Empty candidate list in, empty tier out');

  const tieA = ad({ adId: 'a', priority: 3, weight: 1 });
  const tieB = ad({ adId: 'b', priority: 3, weight: 1 });
  const tieC = ad({ adId: 'c', priority: 1, weight: 999 });
  const tier2 = topPriorityTier([tieA, tieB, tieC]).map((a) => a.adId).sort();
  check(tier2, ['a', 'b'], 'Every ad sharing the max priority is in the tier; lower-priority ads are excluded even with huge weight');
}

// ---- 6. Weighted rotation ----
console.log('\n6. Weighted rotation');
{
  // Deterministic RNG for reproducible distribution checks - a fixed
  // sequence rather than Math.random, matching adRotationRules.js's
  // injectable `rng` parameter (built for exactly this).
  let seed = 42;
  const seededRng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const a = ad({ adId: 'A', priority: 1, weight: 50 });
  const b = ad({ adId: 'B', priority: 1, weight: 30 });
  const c = ad({ adId: 'C', priority: 1, weight: 20 });

  const TRIALS = 20000;
  const counts = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < TRIALS; i += 1) {
    const picked = weightedPick([a, b, c], seededRng);
    counts[picked.adId] += 1;
  }
  const pctA = (counts.A / TRIALS) * 100;
  const pctB = (counts.B / TRIALS) * 100;
  const pctC = (counts.C / TRIALS) * 100;
  console.log(`    distribution over ${TRIALS} trials: A=${pctA.toFixed(1)}% B=${pctB.toFixed(1)}% C=${pctC.toFixed(1)}%`);
  check(Math.abs(pctA - 50) < 3, true, 'Weight 50 ad lands close to a 50% pick rate (not guaranteed exact, per the brief)');
  check(Math.abs(pctB - 30) < 3, true, 'Weight 30 ad lands close to a 30% pick rate');
  check(Math.abs(pctC - 20) < 3, true, 'Weight 20 ad lands close to a 20% pick rate');
  check(counts.A > counts.B && counts.B > counts.C, true, 'Higher weight consistently outperforms lower weight in aggregate');

  // ROTATION: "do not always display the same banner" - across many
  // shuffles, more than one ad should have appeared first at least once.
  const firstPickSeen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const order = weightedShuffle([a, b, c], seededRng);
    firstPickSeen.add(order[0].adId);
  }
  check(firstPickSeen.size > 1, true, 'The carousel does not always open on the same banner across repeated rotations');

  // Priority still gates the rotation set itself.
  const lowPriority = ad({ adId: 'D', priority: 0, weight: 1000 });
  const rotation = getRotationForPlacement([a, b, c, lowPriority], null, seededRng);
  check(rotation.map((x) => x.adId).sort(), ['A', 'B', 'C'], 'Rotation only ever includes the top-priority tier, regardless of a lower-priority ad\'s weight');

  // maxConcurrentAds from placement config caps the rotation set.
  const capped = getRotationForPlacement([a, b, c], { maxConcurrentAds: 2 }, seededRng);
  check(capped.length, 2, 'A placement-configured maxConcurrentAds caps the rotation set size');
  check(rotationCap(null), 5, 'No placement config falls back to the MAX_ROTATION_ADS=5 default ceiling');
  check(rotationCap({ maxConcurrentAds: 0 }), 5, 'An invalid (0) configured cap falls back to the default ceiling rather than showing nothing');

  // selectAdForPlacement (single-pick placements) is also random per call.
  const singlePicks = new Set();
  for (let i = 0; i < 200; i += 1) {
    singlePicks.add(selectAdForPlacement([a, b, c], seededRng).adId);
  }
  check(singlePicks.size > 1, true, 'A single-pick placement with multiple equal-priority ads does not always resolve to the same one');
}

// ---- 7. Frequency limits ----
console.log('\n7. Frequency limits');
{
  const day0 = startOfUtcDay(NOW);
  const earlierToday = day0 + 60 * 1000; // just after UTC midnight today
  const yesterdayMs = day0 - 60 * 1000; // just before UTC midnight today

  // Impressions per user/day
  check(isUnderImpressionCap([], 3, NOW), true, 'Zero impressions today is under any positive cap');
  check(isUnderImpressionCap([earlierToday, earlierToday], 3, NOW), true, '2 of 3 allowed impressions today still leaves room for one more');
  check(isUnderImpressionCap([earlierToday, earlierToday, earlierToday], 3, NOW), false, '3 of 3 allowed impressions today is already at the cap');
  check(isUnderImpressionCap([yesterdayMs, yesterdayMs, yesterdayMs], 3, NOW), true, 'Yesterday\'s impressions do not count against today\'s cap (UTC calendar day)');
  check(isUnderImpressionCap([earlierToday, earlierToday, earlierToday], 0, NOW), true, 'A cap of 0 means unlimited impressions');

  // Clicks per user/day
  check(isUnderClickCap([earlierToday], 1, NOW), false, '1 of 1 allowed click today is already at the cap');
  check(isUnderClickCap([yesterdayMs], 1, NOW), true, 'Yesterday\'s click does not count against today\'s click cap');

  // Interstitials per hour (trailing window, not calendar-hour)
  const fortyMinAgo = NOW - 40 * 60 * 1000;
  const ninetyMinAgo = NOW - 90 * 60 * 1000;
  check(isUnderInterstitialHourlyCap([fortyMinAgo, fortyMinAgo], 3, NOW), true, '2 interstitials in the last hour is still under a cap of 3');
  check(isUnderInterstitialHourlyCap([fortyMinAgo, fortyMinAgo, fortyMinAgo], 3, NOW), false, '3 interstitials in the last hour is already at a cap of 3');
  check(isUnderInterstitialHourlyCap([ninetyMinAgo, ninetyMinAgo, ninetyMinAgo], 3, NOW), true, 'Interstitials from more than an hour ago roll off the trailing window');
}

// ---- 8. No advertisement appears outside its valid schedule (integration-shaped check) ----
console.log('\n8. No advertisement outside its valid schedule');
{
  const candidates = [
    ad({ adId: 'live', status: 'active', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) }),
    ad({ adId: 'future', status: 'approved', startAt: new Date(TOMORROW), endAt: new Date(NEXT_WEEK) }),
    ad({ adId: 'past', status: 'active', startAt: new Date(LAST_WEEK), endAt: new Date(YESTERDAY) }),
    ad({ adId: 'paused', status: 'paused', startAt: new Date(YESTERDAY), endAt: new Date(TOMORROW) }),
  ];
  const effectivelyLive = candidates.filter((a) => getEffectiveAdStatus(a) === 'active').map((a) => a.adId);
  check(effectivelyLive, ['live'], 'Out of scheduled/expired/paused/live candidates, only the one actually inside its window and not paused is effectively active');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
