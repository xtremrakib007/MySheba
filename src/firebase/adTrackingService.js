// Protected server-side ad event tracking.
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { AD_COLLECTIONS } from '../constants/adCollections';
import { AD_TYPES } from '../constants/adEnums';
import { startOfUtcDay, startOfTrailingHour, isUnlimited } from '../utils/adFrequencyRules';
import { getAdSessionId } from './adSessionService';
import { createStore, isOnCooldown, markRecorded as markRecordedInStore } from '../utils/adTrackingRules';

const recentEventStore = createStore();

export function wasRecentlyRecorded(kind, adId, placementId, nowMs = Date.now()) {
  return isOnCooldown(recentEventStore, kind, adId, placementId, nowMs);
}

async function recordEvent(kind, event, adType = AD_TYPES.BANNER) {
  if (!event?.adId || wasRecentlyRecorded(kind, event.adId, event.placementId)) return;
  markRecordedInStore(recentEventStore, kind, event.adId, event.placementId, Date.now());
  try {
    const recordAdEvent = httpsCallable(functions, 'recordAdEvent');
    await recordAdEvent({
      kind,
      adId: event.adId,
      campaignId: event.campaignId || '',
      placementId: event.placementId || '',
      feature: event.feature || '',
      adType: adType || event.adType || AD_TYPES.BANNER,
      clickAction: kind === 'click' ? (event.clickAction || 'none') : 'none',
      sessionId: getAdSessionId(),
    });
  } catch (err) {
    // Tracking is best-effort and never blocks ad rendering.
  }
}

export async function recordImpression(event, adType = AD_TYPES.BANNER) { return recordEvent('impression', event, adType); }
export async function recordClick(event) { return recordEvent('click', event, event?.adType || AD_TYPES.BANNER); }

async function countEventsSince(collectionName, extraWheres, sinceMs) {
  try {
    const { getAuth } = await import('firebase/auth');
    const uid = getAuth().currentUser?.uid;
    if (!uid) return 0;
    const snap = await getCountFromServer(query(collection(db, collectionName), where('userId', '==', uid), ...extraWheres, where('createdAt', '>=', new Date(sinceMs))));
    return snap.data().count;
  } catch (err) { return 0; }
}

export async function canShowImpression(adId, maxImpressionsPerUser) {
  if (isUnlimited(maxImpressionsPerUser)) return true;
  return (await countEventsSince(AD_COLLECTIONS.IMPRESSIONS, [where('adId', '==', adId)], startOfUtcDay(Date.now()))) < Number(maxImpressionsPerUser);
}
export async function canRecordClick(adId, maxClicksPerUser) {
  if (isUnlimited(maxClicksPerUser)) return true;
  return (await countEventsSince(AD_COLLECTIONS.CLICKS, [where('adId', '==', adId)], startOfUtcDay(Date.now()))) < Number(maxClicksPerUser);
}
export async function canShowInterstitial(maxInterstitialsPerUserPerHour) {
  if (isUnlimited(maxInterstitialsPerUserPerHour)) return true;
  return (await countEventsSince(AD_COLLECTIONS.IMPRESSIONS, [where('adType', '==', AD_TYPES.INTERSTITIAL)], startOfTrailingHour(Date.now()))) < Number(maxInterstitialsPerUserPerHour);
}

export async function syncAdCounters(adId, kind) {
  if (!adId || (kind !== 'impression' && kind !== 'click')) throw new Error('syncAdCounters requires a valid adId and kind');
}
