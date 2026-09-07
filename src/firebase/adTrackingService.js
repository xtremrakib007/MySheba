// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// recordImpression/recordClick below are real, working code - not stubs -
// because they're plumbing (write one event doc), not business logic,
// exactly the same category as src/firebase/logService.js's logActivity,
// whose shape they deliberately mirror: create-only, capped to the
// caller's own uid, fire-and-forget (never throws - a tracking failure
// must never be able to break the ad or the screen it's on).
//
// PHASE 6 - FREQUENCY section. canShowImpression/canRecordClick/
// canShowInterstitial below were PHASE 1 stubs ("always returns true,
// never blocks"); this phase makes them real. The actual window math
// (given a list of event millis + a cap, is the caller still under it)
// lives in src/utils/adFrequencyRules.js, a zero-dependency module
// scripts/phase6-campaign-scheduling-tests.js requires() directly - this
// file's only job is turning "how many ad_impressions/ad_clicks docs
// exist for (this ad or this user, this window)" into the plain
// `number[]` of millis that module operates on, via getCountFromServer
// (same aggregation-query pattern src/firebase/analyticsService.js
// already uses elsewhere in this app) rather than downloading every
// matching doc just to count them.
//
// TRUST MODEL: this is a soft, client-side cap - firestore.rules' own
// section on ad_impressions/ad_clicks (see "PHASE 6" note there) allows a
// signed-in user to read only their OWN impression/click docs (plus
// superadmin, unchanged), so a query here can never see another user's
// counts and can never be used to infer them. A compromised client could
// still forge extra ad_impressions/ad_clicks docs or skip the check
// entirely - same trust level PHASE 1's header comment already assigned
// this collection ("a compromised client could spam junk events, but
// nothing security-relevant is ever decided from this collection"); a
// frequency cap is a UX/inventory courtesy to advertisers, not a
// security boundary, so this file doesn't try to make it one.
//
// PHASE 7 - AD TRACKING. Three additions, all in this file plus its
// server-side counterpart functions/adTrackingService.js:
//
//   1. recordImpression/recordClick now also stamp `feature` (the
//      FEATURE_IDS screen the event happened on - SmartAd already
//      receives this as a required prop) and `sessionId` (this app
//      launch's ad-analytics session - src/firebase/adSessionService.js,
//      deliberately NOT the device-login session, see that file's header).
//      `userId` is now only ever set when someone is signed in - "record
//      userId when appropriate" per the PHASE 7 brief - but unlike PHASE
//      1-6, an impression/click on a public/pre-login screen is no longer
//      silently dropped: it still gets recorded (with feature/placement/
//      session, no userId), since impression/click COUNTS themselves
//      shouldn't undercount just because nobody's logged in yet, and
//      counting less personal information is exactly the brief's own
//      "do not collect unnecessary personal information" instruction.
//
//   2. wasRecentlyRecorded/markRecorded below: an in-memory, per-app-
//      session cooldown keyed on (kind, adId, placementId) - see that
//      section's own comment for why this exists ALONGSIDE, not instead
//      of, SmartAd's existing "one impression per activeAd.id change"
//      effect-dependency guard.
//
//   3. syncAdCounters is no longer a client stub. Advertisement.
//      totalImpressions/totalClicks are kept in sync by
//      functions/adTrackingService.js's onAdImpressionCreated/
//      onAdClickCreated triggers - a Firestore transaction incrementing
//      advertisements/{adId} every time an ad_impressions/ad_clicks doc
//      is created. That is the ONLY writer of those two fields:
//      firestore.rules' advertisements/{adId} rule is
//      `allow write: if signedIn() && isSuperadmin()` (unchanged this
//      phase - see the "PHASE 1 - Advertisement System" section there),
//      so a signed-in non-superadmin client has no write path to
//      totalImpressions/totalClicks at all, direct or otherwise - the
//      PHASE 7 brief's "users must not be able to directly modify
//      impression/click counters" holds by construction, not by
//      convention. syncAdCounters here is kept only as the documented,
//      already-imported call site other code was written against; it
//      does nothing beyond confirm the args look sane, because the real
//      sync already happened server-side before this function could even
//      be called from a freshly-written client doc.
//
// ad_reports roll-ups remain a later-phase stub - out of PHASE 7's scope
// (impression/click event recording + duplicate protection + counters),
// unchanged from PHASE 1.

import {
  collection, addDoc, query, where, serverTimestamp, getCountFromServer,
} from 'firebase/firestore';
import { db, auth } from './config';
import { AD_COLLECTIONS } from '../constants/adCollections';
import { AD_TYPES } from '../constants/adEnums';
import {
  startOfUtcDay, startOfTrailingHour, isUnlimited,
} from '../utils/adFrequencyRules';
import { getAdSessionId } from './adSessionService';
import { createStore, isOnCooldown, markRecorded as markRecordedInStore } from '../utils/adTrackingRules';

// ---- PHASE 7 - DUPLICATE PROTECTION ----
//
// SmartAd.js's AdRotator already fires recordImpression from a useEffect
// keyed on `activeAd?.id` - that alone already stops a React re-render
// from ever re-firing it (the effect just doesn't re-run unless the id
// actually changes), which covers the ordinary "component re-rendered for
// an unrelated reason" case without any help from this file.
//
// What that effect dependency does NOT cover: a component REMOUNT (the
// brief's own example) throws away that hook's closure entirely and runs
// the effect fresh, as if this were the very first time that ad was ever
// shown - a screen the user navigates away from and immediately back to,
// or a parent re-key/remount during a fast refresh, can genuinely refire
// an impression for an ad that was already just shown a second ago. A
// rapid double-tap on a banner has the same shape on the click side (the
// tap handler has no memory of the previous tap at all).
//
// The actual cooldown math (given a store + a (kind, adId, placementId) +
// now, is this a duplicate) lives in src/utils/adTrackingRules.js, a
// zero-dependency module scripts/phase7-ad-tracking-tests.js requires()
// directly - same split this file already uses for adFrequencyRules.js.
// The store itself is module-scoped here (like adSessionService's session
// id), so it resets on a real app relaunch (a genuinely new session, and
// a fresh ad view, should count again) but survives remounts within the
// same app open. Deliberately NOT a Firestore round-trip: a network read
// on every single impression/click just to decide whether to record it
// would be slower than the write it's protecting, and would itself be
// racy across rapid events.
const recentEventStore = createStore();

/** True if this exact (kind, adId, placementId) was already recorded
 * recently enough to count as a duplicate - i.e. a remount/rapid-repeat
 * firing the same event again a moment later, not a genuinely new view/
 * tap. See src/utils/adTrackingRules.js for the underlying cooldown math. */
export function wasRecentlyRecorded(kind, adId, placementId, nowMs = Date.now()) {
  return isOnCooldown(recentEventStore, kind, adId, placementId, nowMs);
}

/**
 * Records one "this ad was shown" event. Never throws - a tracking
 * failure must never be able to break the ad or the screen it's on. A
 * duplicate within RECENT_EVENT_COOLDOWN_MS (see DUPLICATE PROTECTION
 * above) is silently skipped rather than written twice.
 * @param {import('../types/ads').AdImpression} event - adId/campaignId/placementId/feature (userId/sessionId/createdAt are filled in here)
 * @param {import('../constants/adEnums').AdType} [adType] - PHASE 6: stored on the event so canShowInterstitial can query "every interstitial this user has seen recently" without needing to join back to each ad's own adType. Defaults to 'banner' (every event recorded before this phase existed was a banner - see SmartAd.js's own adType default), so this stays backward-compatible with any doc already written.
 */
export async function recordImpression(event, adType = AD_TYPES.BANNER) {
  if (wasRecentlyRecorded('impression', event.adId, event.placementId)) return;
  const uid = auth.currentUser && auth.currentUser.uid;
  try {
    const doc = {
      adId: event.adId,
      campaignId: event.campaignId,
      placementId: event.placementId,
      adType,
      sessionId: getAdSessionId(),
      createdAt: serverTimestamp(),
    };
    if (event.feature) doc.feature = event.feature;
    // "record userId when appropriate" (PHASE 7 brief) - only ever
    // attached when someone is actually signed in, never a placeholder
    // value, so a signed-out impression collects strictly less personal
    // information rather than a fabricated id.
    if (uid) doc.userId = uid;
    // Marked BEFORE the write settles, deliberately: this is a
    // best-effort duplicate guard, not a delivery guarantee (same
    // fire-and-forget posture as the rest of this function) - a write
    // that fails after this point stays silently dropped rather than
    // retried, exactly like every other failure case in this function.
    markRecordedInStore(recentEventStore, 'impression', event.adId, event.placementId, Date.now());
    await addDoc(collection(db, AD_COLLECTIONS.IMPRESSIONS), doc);
  } catch (err) {
    // fire-and-forget, matching logActivity - see file header
  }
}

/**
 * Records one "this ad was tapped" event. Same trust/failure/duplicate-
 * protection model as recordImpression above.
 * @param {import('../types/ads').AdClick} event - adId/campaignId/placementId/clickAction/feature (userId/sessionId/createdAt are filled in here)
 */
export async function recordClick(event) {
  if (wasRecentlyRecorded('click', event.adId, event.placementId)) return;
  const uid = auth.currentUser && auth.currentUser.uid;
  try {
    const doc = {
      adId: event.adId,
      campaignId: event.campaignId,
      placementId: event.placementId,
      clickAction: event.clickAction,
      sessionId: getAdSessionId(),
      createdAt: serverTimestamp(),
    };
    if (event.feature) doc.feature = event.feature;
    if (uid) doc.userId = uid;
    markRecordedInStore(recentEventStore, 'click', event.adId, event.placementId, Date.now());
    await addDoc(collection(db, AD_COLLECTIONS.CLICKS), doc);
  } catch (err) {
    // fire-and-forget, matching logActivity - see file header
  }
}

/** Count of ad_impressions/ad_clicks docs matching `extraWheres`, created
 * at or after `sinceMs`, for the signed-in user. Returns 0 (never blocks)
 * if no one is signed in or the count query itself fails - same
 * fail-open-on-infra-error posture as adTargetingService's own
 * fail-silent Firestore listeners; a frequency cap must never be able to
 * hide an ad just because a count query timed out. */
async function countEventsSince(collectionName, extraWheres, sinceMs) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return 0;
  try {
    const constraints = [
      where('userId', '==', uid),
      ...extraWheres,
      where('createdAt', '>=', new Date(sinceMs)),
    ];
    const snap = await getCountFromServer(query(collection(db, collectionName), ...constraints));
    return snap.data().count;
  } catch (err) {
    return 0;
  }
}

/**
 * PHASE 6 - true if showing one more impression of `adId` (whose
 * Advertisement.maxImpressionsPerUser is `maxImpressionsPerUser` - a cap
 * of 0/null/undefined means unlimited, see adFrequencyRules.isUnlimited)
 * would still be within the FREQUENCY section's "Maximum impressions per
 * user/day" cap. UTC-calendar-day window - see adFrequencyRules.js's
 * TIMEZONE note for why this deliberately isn't device-local-day.
 * @param {string} adId
 * @param {number} maxImpressionsPerUser
 * @returns {Promise<boolean>}
 */
export async function canShowImpression(adId, maxImpressionsPerUser) {
  if (isUnlimited(maxImpressionsPerUser)) return true;
  const now = Date.now();
  const count = await countEventsSince(
    AD_COLLECTIONS.IMPRESSIONS,
    [where('adId', '==', adId)],
    startOfUtcDay(now)
  );
  return count < Number(maxImpressionsPerUser);
}

/**
 * PHASE 6 - same idea as canShowImpression, for Advertisement.
 * maxClicksPerUser ("Maximum clicks per user/day").
 * @param {string} adId
 * @param {number} maxClicksPerUser
 * @returns {Promise<boolean>}
 */
export async function canRecordClick(adId, maxClicksPerUser) {
  if (isUnlimited(maxClicksPerUser)) return true;
  const now = Date.now();
  const count = await countEventsSince(
    AD_COLLECTIONS.CLICKS,
    [where('adId', '==', adId)],
    startOfUtcDay(now)
  );
  return count < Number(maxClicksPerUser);
}

/**
 * PHASE 6 - true if showing one more interstitial (of ANY ad - see
 * adFrequencyRules.isUnderInterstitialHourlyCap's header comment on why
 * this cap is per-user, not per-ad) would still be within
 * AdSettings.maxInterstitialsPerUserPerHour ("Maximum interstitials per
 * hour"). Trailing 1-hour window ending now, not a calendar-hour bucket -
 * see adFrequencyRules.startOfTrailingHour.
 * @param {number} maxInterstitialsPerUserPerHour
 * @returns {Promise<boolean>}
 */
export async function canShowInterstitial(maxInterstitialsPerUserPerHour) {
  if (isUnlimited(maxInterstitialsPerUserPerHour)) return true;
  const now = Date.now();
  const count = await countEventsSince(
    AD_COLLECTIONS.IMPRESSIONS,
    [where('adType', '==', AD_TYPES.INTERSTITIAL)],
    startOfTrailingHour(now)
  );
  return count < Number(maxInterstitialsPerUserPerHour);
}

/**
 * PHASE 7 - Advertisement.totalImpressions/totalClicks are now kept in
 * sync entirely server-side by functions/adTrackingService.js's
 * onAdImpressionCreated/onAdClickCreated triggers (a Firestore
 * transaction incrementing advertisements/{adId} every time this file's
 * recordImpression/recordClick above successfully creates an
 * ad_impressions/ad_clicks doc) - see this file's PHASE 7 header comment
 * for why that, not a client write, is what makes the SECURITY
 * requirement ("users must not be able to directly modify impression/
 * click counters") hold by construction. There is nothing left for the
 * client to do by the time an ad_impressions/ad_clicks doc exists, so
 * this function is a no-op kept only so any existing call site (or a
 * caller expecting the PHASE 1-6 stub's signature) doesn't need to
 * change - it validates its arguments and returns, it does not itself
 * write anything.
 * @param {string} adId
 * @param {'impression' | 'click'} kind
 */
export async function syncAdCounters(adId, kind) {
  if (!adId || (kind !== 'impression' && kind !== 'click')) {
    throw new Error('syncAdCounters requires a valid adId and kind ("impression" | "click")');
  }
  // Intentionally does nothing else - see comment above.
}
