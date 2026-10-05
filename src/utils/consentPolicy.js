// The exact words shown when personal data is collected.
//
// Mirrors functions/consentPolicy.js, which is what validates and stores the
// acceptance. A test asserts the two are identical: the server records a
// version number, and a version that points at wording the person never saw is
// worse than having no record at all.
//
// They cannot import each other - this ships in the app bundle and that runs in
// Cloud Functions - so the test is what keeps them honest.

export const CONSENT_PURPOSES = {
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

/** What a ticked box sends. The server rejects anything that is not this shape. */
export function consentPayload(purpose) {
  const found = CONSENT_PURPOSES[purpose];
  if (!found) throw new Error('Unknown consent purpose: ' + purpose);
  return { accepted: true, purpose, version: found.version };
}

export function consentText(purpose) {
  return CONSENT_PURPOSES[purpose]?.text || '';
}
