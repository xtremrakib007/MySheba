// Mints short-lived Agora RTC tokens for voice/video calls.
//
// Why this has to be a Cloud Function and not client code: joining an Agora
// channel with a token requires the App Certificate, and anyone who can read
// that certificate can forge tokens for any channel forever. The App ID
// (33d2bc63351f42be816000546bbed7bc) is fine in the client bundle - it's
// just an identifier. The App Certificate is the actual secret and must
// only ever live here, in Secret Manager.
//
// One-time setup (from the mysheba/functions directory):
//   npm install agora-token
//   firebase functions:secrets:set AGORA_APP_CERTIFICATE
//     (paste the App Certificate from console.agora.io > your project)
//   firebase deploy --only functions:generateAgoraToken
//
// Client call (see src/firebase/callService.js):
//   const fn = httpsCallable(functions, 'generateAgoraToken');
//   const { data } = await fn({ channelName });
//   // data => { token, appId, uid, channelName, expiresAt }
//
// Group calls pass a second field, `uid` - a deterministic numeric id the
// client derived from its own Firebase uid (see src/utils/agoraUid.js) so
// every participant can independently compute everyone else's numeric uid
// ahead of time and label remote video tiles by identity. 1:1 calls omit
// it and get the same uid-0 "let Agora assign one" behavior as before.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { logServerError } = require('./logService');

const AGORA_APP_ID = '33d2bc63351f42be816000546bbed7bc';
const agoraCertificate = defineSecret('AGORA_APP_CERTIFICATE');

// How long a token stays valid once issued. The app re-requests a fresh one
// each time it joins a call, so this just bounds how long a leaked/stale
// token could be replayed - it's not how long a call can last.
const TOKEN_TTL_SECONDS = 3600;

exports.generateAgoraToken = onCall({ secrets: [agoraCertificate] }, (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to start or join a call.');
  }

  const channelName = request.data && request.data.channelName;
  if (!channelName || typeof channelName !== 'string' || channelName.length > 64) {
    throw new HttpsError('invalid-argument', 'A valid channelName is required.');
  }

  const certificate = agoraCertificate.value();
  if (!certificate) {
    // Fire-and-forget - a misconfigured secret is worth surfacing in
    // Admin's error log, but must not block the HttpsError below.
    logServerError('generateAgoraToken', new Error('AGORA_APP_CERTIFICATE secret is not configured'), {
      userId: request.auth.uid,
    });
    throw new HttpsError(
      'failed-precondition',
      'AGORA_APP_CERTIFICATE secret is not configured on the server.'
    );
  }

  // uid 0 tells Agora "let the SDK pick a uid on join" - simplest option
  // when the app doesn't need to predict the numeric uid ahead of time.
  // Group calls request a specific deterministic uid instead (see the
  // comment at the top of this file) so remote tiles can be identified;
  // validate it's a real Agora-legal uid (0 < uid < 2^32) before honoring
  // it, and fall back to 0 for anything malformed rather than erroring the
  // whole call out over a bad client-computed hash.
  const requestedUid = request.data && request.data.uid;
  const uid = Number.isInteger(requestedUid) && requestedUid > 0 && requestedUid < 4294967295
    ? requestedUid
    : 0;
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpiresAt = now + TOKEN_TTL_SECONDS;

  let token;
  try {
    token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      certificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiresAt,
      privilegeExpiresAt
    );
  } catch (err) {
    logServerError('generateAgoraToken', err, { userId: request.auth.uid });
    throw new HttpsError('internal', 'Could not generate a call token.');
  }

  return {
    token,
    appId: AGORA_APP_ID,
    uid,
    channelName,
    expiresAt: privilegeExpiresAt,
  };
});
