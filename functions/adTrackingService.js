// PHASE 7 - MySheba Advertisement System - AD TRACKING (server half).
//
// The ONLY writer of advertisements/{adId}.totalImpressions/totalClicks.
// firestore.rules' advertisements/{adId} rule is
// `allow write: if signedIn() && isSuperadmin()` (see the
// "PHASE 1 - Advertisement System" section there, unchanged this phase) -
// a signed-in non-superadmin client has no write path to those two
// fields, direct or otherwise. This file is what actually keeps them
// accurate: an onDocumentCreated trigger on ad_impressions/ad_clicks
// (the client's only write path into the ad-tracking collections - see
// src/firebase/adTrackingService.js) that atomically increments the
// matching advertisements/{adId} doc inside a Firestore transaction.
//
// Trust model carried over unchanged from PHASE 1/6 (see
// src/firebase/adTrackingService.js's own header comment): a compromised
// client could still spam junk ad_impressions/ad_clicks docs (nothing
// security-relevant is ever decided from raw event counts), which would
// in turn inflate totalImpressions/totalClicks by the same junk amount -
// but it could NEVER set those two counters to an arbitrary value of its
// choosing, only ever +1 per event doc it can already create anyway. That
// is exactly the PHASE 7 brief's "users must not be able to directly
// modify impression/click counters" - the counters only ever move by
// server-side transaction, never by client-authored field value.
//
// FAILURE RULE: same "must never break the feature" posture as every
// other ad-system file. If the referenced advertisements/{adId} doc
// doesn't exist (e.g. a stale/malformed event, or an ad deleted after its
// last impression was already queued), the transaction is skipped
// silently rather than throwing - a missing ad doc must never turn into
// a crashed/retried Cloud Function invocation for what is, at worst, one
// under-counted event.
//
// PHASE 8 - DAILY ROLLUP. Same two triggers now also upsert one
// ad_daily_stats/{id} doc per event (src/types/ads.ts's AdDailyStat) -
// the ONLY thing src/firebase/adAnalyticsService.js ever reads
// impressions/clicks/CTR from, per the PHASE 8 brief's own PERFORMANCE
// section ("do not query millions of raw impression documents for every
// dashboard load"). `id` is deterministic
// (`${date}__${adId}__${placementId}__${feature}`, see
// dailyStatDocId below) rather than auto-generated, so concurrent events
// for the same (day, ad, placement, feature) bucket upsert the SAME doc
// via `set(..., { merge: true })` + FieldValue.increment(1), instead of
// racing to create two separate docs that would both need summing later.
// campaignId/advertiserId are denormalized off the advertisements/{adId}
// doc this same transaction already reads (the ad_impressions/ad_clicks
// event itself only carries campaignId, never advertiserId), so
// adAnalyticsService.js's Advertiser Performance report can group by
// advertiserId without a second join per row.
//
// Deliberately still inside the SAME Firestore transaction as the
// totalImpressions/totalClicks increment above (one more tx.set call on
// a different doc, no extra read) - either both writes land or neither
// does, so totalImpressions/totalClicks and the day's ad_daily_stats
// bucket can never drift apart from a half-applied trigger.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/** millis -> 'YYYY-MM-DD', UTC calendar day. Mirrors
 * src/utils/adAnalyticsRules.js's dateKeyFromMillis exactly - both sides
 * of this feature must agree on what day an event "happened on", or a
 * dashboard querying by one boundary would silently miss rows written
 * against the other. */
function dateKeyFromMillis(ms) {
  const d = new Date(ms);
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Deterministic ad_daily_stats doc id for one (day, ad, placement,
 * feature) bucket - see DAILY ROLLUP header above for why this is
 * deterministic rather than auto-generated. '__' separators (not '/' or
 * '.', both illegal in a Firestore doc id) - placementId/feature values
 * are our own enum-like ids (PLACEMENT_IDS/FEATURE_IDS), never free text,
 * so this never needs escaping. */
function dailyStatDocId(dateKey, adId, placementId, feature) {
  return `${dateKey}__${adId}__${placementId || 'unknown'}__${feature || 'unknown'}`;
}

/** Atomically increments advertisements/{adId}.field by 1 AND upserts
 * that event's ad_daily_stats bucket, in one transaction - doing neither
 * if the ad doc doesn't exist (see FAILURE RULE above). Shared by both
 * triggers below so "impression" and "click" counting/rollup can never
 * drift into two different strategies over time.
 * @param {string} adId
 * @param {'totalImpressions' | 'totalClicks'} counterField
 * @param {'impressions' | 'clicks'} statField
 * @param {{ campaignId?: string, placementId?: string, feature?: string, whenMs: number }} event
 */
async function incrementAdCounter(adId, counterField, statField, event) {
  if (!adId) return;
  const db = admin.firestore();
  const adRef = db.collection('advertisements').doc(adId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(adRef);
    if (!snap.exists) return; // see FAILURE RULE - stale/malformed event, never throw
    tx.update(adRef, { [counterField]: admin.firestore.FieldValue.increment(1) });

    const ad = snap.data() || {};
    const dateKey = dateKeyFromMillis(event.whenMs);
    const placementId = event.placementId || 'unknown';
    const feature = event.feature || 'unknown';
    const statRef = db.collection('ad_daily_stats').doc(dailyStatDocId(dateKey, adId, placementId, feature));
    tx.set(statRef, {
      date: dateKey,
      adId,
      // Prefer the event's own campaignId (set at write time from the ad
      // the event was actually recorded against) and fall back to the ad
      // doc's current campaignId only if the event omitted it - an ad's
      // own campaignId can be reassigned after events were recorded, and
      // the event's value is the more historically accurate one.
      campaignId: event.campaignId || ad.campaignId || null,
      advertiserId: ad.advertiserId || null,
      placementId,
      feature,
      [statField]: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/** event.data.data().createdAt is a resolved Firestore Timestamp by the
 * time an onDocumentCreated trigger fires (serverTimestamp() is resolved
 * at write-commit, before the trigger runs) - .toMillis() is the normal
 * path. Falls back to Date.now() only for a malformed/missing createdAt,
 * so one bad event still lands in TODAY's bucket rather than throwing. */
function eventMillis(data) {
  const ts = data && data.createdAt;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

exports.onAdImpressionCreated = onDocumentCreated('ad_impressions/{id}', async (event) => {
  const impression = event.data.data();
  try {
    await incrementAdCounter(impression.adId, 'totalImpressions', 'impressions', {
      campaignId: impression.campaignId,
      placementId: impression.placementId,
      feature: impression.feature,
      whenMs: eventMillis(impression),
    });
  } catch (err) {
    // Never let a counter-sync failure retry-storm the trigger or surface
    // anywhere client-facing - the raw ad_impressions doc this counter is
    // derived from already exists and is never lost, so a missed
    // increment here is recoverable by a later reconciliation job, not an
    // emergency.
    console.error('onAdImpressionCreated: failed to sync totalImpressions/ad_daily_stats', impression && impression.adId, err);
  }
});

exports.onAdClickCreated = onDocumentCreated('ad_clicks/{id}', async (event) => {
  const click = event.data.data();
  try {
    await incrementAdCounter(click.adId, 'totalClicks', 'clicks', {
      campaignId: click.campaignId,
      placementId: click.placementId,
      feature: click.feature,
      whenMs: eventMillis(click),
    });
  } catch (err) {
    console.error('onAdClickCreated: failed to sync totalClicks/ad_daily_stats', click && click.adId, err);
  }
});
