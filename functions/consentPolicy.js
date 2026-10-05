/**
 * Consent, recorded rather than merely asked for.
 *
 * The app collects things people cannot get back: an IC number, a passport
 * number, a selfie, photographs of identity documents, a sender's and a
 * receiver's home address. None of it was ever accompanied by a record that
 * the person agreed to it. The KYC screen showed a sentence - "By submitting,
 * you confirm..." - which nobody had to acknowledge and which was stored
 * nowhere, so months later there is no way to answer "did they agree, to what,
 * and when".
 *
 * A checkbox on its own does not fix that. A checkbox gates a button in one
 * build of one app; the callable behind it can still be called without one, and
 * `myDocuments` is written by the client straight into Firestore. So consent is
 * REQUIRED at the point the data lands, and the acceptance is stored with the
 * server's own clock.
 *
 * The version is the part that makes the record worth keeping. Consent is to a
 * specific wording; change the wording and the old acceptance no longer covers
 * it. Storing `version` is what lets somebody later retrieve the exact words a
 * person agreed to, which is the whole point of having asked.
 *
 * Pure: no Firestore, no clock.
 */

/**
 * Each purpose is one moment where personal data is collected, with the words
 * shown at that moment. src/utils/consentPolicy.js mirrors this for display and
 * a test asserts the two are identical - a consent whose stored version points
 * at wording the person never saw is worse than no record at all.
 */
const CONSENT_PURPOSES = {
  registration: {
    version: 1,
    text: 'I agree that MySheba may collect and process my name, phone number and email address to create and operate my account.',
  },
  kyc: {
    version: 1,
    text: 'I confirm the identity documents and photographs I am submitting are mine and accurate, and I agree that MySheba may collect, store and process them to verify my identity.',
  },
  documents: {
    version: 1,
    text: 'I agree that MySheba may store the documents and personal details I upload here, and that I am entitled to share them.',
  },
  travel: {
    version: 1,
    text: 'I agree that MySheba may collect and process the travel details and contact information I provide here so that an agent can contact me and arrange this booking.',
  },
  remittance: {
    version: 1,
    text: 'I agree that MySheba may collect and process the sender and recipient details I provide, including identity and address information, to carry out this transfer and to meet its legal obligations.',
  },
};

const CONSENT_KEYS = Object.keys(CONSENT_PURPOSES);

function currentVersion(purpose) {
  const found = CONSENT_PURPOSES[purpose];
  return found ? found.version : 0;
}

function consentText(purpose) {
  const found = CONSENT_PURPOSES[purpose];
  return found ? found.text : '';
}

/**
 * The record to store, or the reason this is not consent.
 *
 * @returns {{ok:true, consent:{purpose,version,text}} | {ok:false, reason:string}}
 */
function readConsent(input, purpose) {
  if (!CONSENT_PURPOSES[purpose]) return { ok: false, reason: 'Unknown consent purpose.' };
  const given = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!given) return { ok: false, reason: 'Please tick the box to continue.' };

  // Exactly true. A truthy value - the string 'false', 1, 'no' - is not somebody
  // ticking a box, and a client that sends one is not a client that asked.
  if (given.accepted !== true) return { ok: false, reason: 'Please tick the box to continue.' };

  // The purpose has to match what is being collected. Consent given for
  // uploading a document is not consent for a remittance's passport details.
  if (given.purpose !== purpose) return { ok: false, reason: 'That agreement was for something else.' };

  // No coercion. Number('1') is 1, so a string slipped through - and a consent
  // record is not the place to be lenient about what the client sent. Ours
  // sends a number from consentPolicy.js; anything else did not come from the
  // screen that showed the words.
  const version = given.version;
  const current = currentVersion(purpose);
  if (typeof version !== 'number' || !Number.isInteger(version) || version !== current) {
    // Older wording does not cover newer wording. Asking again is the only
    // honest answer; accepting a stale version would record agreement to words
    // the person never saw.
    return { ok: false, reason: 'Please review and accept the current terms.' };
  }

  return { ok: true, consent: { purpose, version, text: consentText(purpose) } };
}

module.exports = { CONSENT_PURPOSES, CONSENT_KEYS, currentVersion, consentText, readConsent };
