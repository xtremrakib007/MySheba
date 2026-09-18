// PHASE 7 - MySheba Advertisement System - AD TRACKING.
//
// Where the `sessionId` on every ad_impressions/ad_clicks doc
// (adTrackingService.js) comes from. Deliberately its OWN concept, not a
// reuse of deviceSessionService.js's device-login sessionId:
//   - deviceSessionService's sessionId is a single-device-login security
//     primitive, stamped onto users/{uid}.activeSessionId server-side and
//     persisted in AsyncStorage so it survives app restarts (its whole
//     point is to detect a login on a DIFFERENT device later).
//   - This one is purely an ad-analytics grouping key ("how many
//     impressions/clicks happened in one continuous app open" - the
//     PHASE 7 brief's `sessionId` field). It's generated fresh every time
//     the JS module loads (i.e. every cold app launch), never persisted,
//     and never sent anywhere except stamped onto ad_impressions/
//     ad_clicks docs. Reusing the login session id would leak a security
//     identifier into an analytics collection with a much wider read
//     surface (see firestore.rules' ad_impressions/ad_clicks section) for
//     zero benefit - an ad session is "this app open", not "this login".
//
// No AsyncStorage/persistence on purpose: a relaunch is a new ad session
// by design, same as most mobile ad SDKs treat "session" for impression
// grouping.

import { randomUUID } from 'expo-crypto';

function generateId() {
  // Use the platform-backed UUID generator instead of Math.random().
  return randomUUID();
}

// Module-scoped, not exported directly - one id for the lifetime of this
// JS module instance (i.e. one per app launch/reload), same as any other
// module-level singleton in this codebase.
let currentSessionId = generateId();

/** This app launch's ad-analytics session id. Stable for as long as the
 * JS module stays loaded; a fresh app launch (or a dev Fast Refresh full
 * reload) gets a new one - see file header for why that's intentional. */
export function getAdSessionId() {
  return currentSessionId;
}

/** Test/dev-only escape hatch to force a new ad session without
 * relaunching the app - not called anywhere in production code. */
export function resetAdSessionId() {
  currentSessionId = generateId();
  return currentSessionId;
}
