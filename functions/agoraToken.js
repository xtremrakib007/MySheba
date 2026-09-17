// Mints short-lived Agora RTC tokens for authorized voice/video calls.
// The App Certificate stays server-side in Secret Manager; this function also
// verifies that the Firebase user belongs to the requested call before a token
// can be minted.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');

const AGORA_APP_ID = '33d2bc63351f42be816000546bbed7bc';
const agoraCertificate = defineSecret('AGORA_APP_CERTIFICATE');
const TOKEN_TTL_SECONDS = 3600;
const CALLS_COLLECTION = 'calls';

// Keep the same deterministic mapping used by src/utils/agoraUid.js without
// importing client-side source into Cloud Functions.
function agoraUidFor(firebaseUid) {
  if (!firebaseUid) return 1;
  let hash = 0x811c9dc5;
  for (let i = 0; i < firebaseUid.length; i++) {
    hash ^= firebaseUid.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const uid = hash >>> 0;
  return uid === 0 ? 1 : uid;
}

exports.generateAgoraToken = onCall({ secrets: [agoraCertificate] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to join a call.');
  }

  const channelName = request.data && request.data.channelName;
  if (!channelName || typeof channelName !== 'string' || channelName.length > 64) {
    throw new HttpsError('invalid-argument', 'A valid channelName is required.');
  }

  // CallService creates channels as exactly call_<Firestore call document id>.
  // Do not accept arbitrary channel names: a valid signed-in account must be
  // a participant in the corresponding call document.
  const match = /^call_([A-Za-z0-9_-]{1,100})$/.exec(channelName);
  if (!match) {
    throw new HttpsError('invalid-argument', 'Invalid call channel.');
  }
  const callId = match[1];

  const certificate = agoraCertificate.value();
  if (!certificate) {
    logServerError('generateAgoraToken', new Error('AGORA_APP_CERTIFICATE secret is not configured'), {
      userId: request.auth.uid,
      callId,
    });
    throw new HttpsError('failed-precondition', 'Call service is not configured on the server.');
  }

  let callData;
  try {
    const callSnap = await admin.firestore().collection(CALLS_COLLECTION).doc(callId).get();
    if (!callSnap.exists) {
      throw new HttpsError('not-found', 'Call not found.');
    }
    callData = callSnap.data() || {};
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logServerError('generateAgoraToken', err, { userId: request.auth.uid, callId });
    throw new HttpsError('internal', 'Could not verify the call.');
  }

  const callerUid = callData.callerUid;
  const calleeUid = callData.calleeUid;
  const userUid = request.auth.uid;
  const isParticipant = userUid === callerUid || userUid === calleeUid;

  if (!isParticipant) {
    throw new HttpsError('permission-denied', 'You are not a participant in this call.');
  }

  if (callData.channelName !== channelName) {
    throw new HttpsError('permission-denied', 'The call channel does not match the call record.');
  }

  // A token should not be minted for a call that has already been declined or
  // ended. Both participants may need a token while ringing or after accept.
  if (!['ringing', 'accepted'].includes(callData.status)) {
    throw new HttpsError('failed-precondition', 'This call is no longer active.');
  }

  // 1:1 calls historically use uid 0 (Agora assigns the runtime UID). If the
  // client supplies a deterministic UID, only accept the UID belonging to the
  // authenticated Firebase user; otherwise a caller could impersonate another
  // participant's Agora identity by choosing their numeric UID.
  const requestedUid = request.data && request.data.uid;
  const deterministicUid = agoraUidFor(userUid);
  let uid = 0;
  if (requestedUid !== undefined && requestedUid !== null) {
    if (!Number.isInteger(requestedUid) || requestedUid <= 0 || requestedUid >= 4294967295) {
      throw new HttpsError('invalid-argument', 'Invalid Agora UID.');
    }
    if (requestedUid !== deterministicUid) {
      throw new HttpsError('permission-denied', 'Agora UID does not belong to the signed-in user.');
    }
    uid = requestedUid;
  }

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
    logServerError('generateAgoraToken', err, { userId: userUid, callId });
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
