const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { readConsent } = require('./consentPolicy');

const COLLECTION = 'consents';

/**
 * Require consent, and keep the proof.
 *
 * Throws if the box was not ticked, so the caller cannot accidentally continue
 * without it - the data is collected on the next line, and a helper that
 * returned false would be one forgotten `if` away from collecting it anyway.
 *
 * The record is written with the SERVER's clock and the uid from the verified
 * token. A timestamp the client chose, or a uid it supplied, would prove
 * nothing about who agreed or when - which is the only reason to keep this.
 *
 * Written outside any transaction and before the data is stored: an acceptance
 * recorded for something that then failed is harmless, where data stored
 * against an acceptance that failed to write is exactly what this prevents.
 */
async function requireConsent(db, uid, input, purpose, context) {
  const result = readConsent(input, purpose);
  if (!result.ok) throw new HttpsError('failed-precondition', result.reason);

  await db.collection(COLLECTION).add({
    uid: String(uid || ''),
    purpose: result.consent.purpose,
    version: result.consent.version,
    // The wording itself, copied in. Reading the version against a policy file
    // that has since changed would give the current words, not the ones shown.
    text: result.consent.text,
    source: String(context?.source || ''),
    ip: String(context?.ip || ''),
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return result.consent;
}

module.exports = { requireConsent, CONSENT_COLLECTION: COLLECTION };
