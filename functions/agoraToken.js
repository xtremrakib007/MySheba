const { onCall, HttpsError } = require('firebase-functions/v2/https');

// Voice/video calling was removed from MySheba. Keep the legacy callable name
// temporarily so old clients fail closed instead of receiving an Agora token.
exports.generateAgoraToken = onCall(async () => {
  throw new HttpsError('failed-precondition', 'Voice and video calling is disabled.');
});
