const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

exports.markGoogleLinked = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  try {
    const userRecord = await admin.auth().getUser(uid);
    const googleProvider = (userRecord.providerData || []).find(
      (provider) => provider.providerId === 'google.com'
    );

    if (!googleProvider) {
      throw new HttpsError(
        'failed-precondition',
        'A verified Google account is not linked to this user.'
      );
    }

    const googleEmail = String(googleProvider.email || '').trim().toLowerCase();
    if (!googleEmail) {
      throw new HttpsError(
        'failed-precondition',
        'The linked Google account has no email address.'
      );
    }

    await admin.firestore().collection('users').doc(uid).set(
      { googleLinked: true, googleEmail },
      { merge: true }
    );

    return { googleLinked: true, googleEmail };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('markGoogleLinked failed', { uid, error: err });
    throw new HttpsError('internal', 'Unable to update Google link status.');
  }
});
