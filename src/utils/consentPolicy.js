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
    details: 'What we collect: your name, mobile number and email address.\n\nWhy: to create your account, sign you in, and contact you about your orders.\n\nHow long: for as long as your account exists, and afterwards only where the law requires us to keep records.\n\nYour choices: you can correct these details in your profile at any time, or contact support to close your account.',
    text: 'I agree that MySheba may collect and process my name, phone number and email address to create and operate my account.',
  },
  kyc: {
    version: 1,
    details: 'What we collect: photographs of the identity document you choose, a photograph of your face, and the details printed on the document - its number, your date of birth, nationality and gender.\n\nWhy: to confirm you are who you say you are. We are required to verify identity before certain services can be used.\n\nHow long: for as long as your account exists and for the period our regulators require after it closes.\n\nWho sees it: our verification staff. It is not sold or shared for marketing.\n\nYour choices: you may decline, but services that require a verified identity will stay unavailable.',
    text: 'I confirm the identity documents and photographs I am submitting are mine and accurate, and I agree that MySheba may collect, store and process them to verify my identity.',
  },
  documents: {
    version: 1,
    details: 'What we collect: the files you upload and the details you type about them - document type, number, issue and expiry dates, and any notes you add.\n\nWhy: to store them for you and remind you before they expire. This is a convenience feature; we do not use these documents for anything else.\n\nHow long: until you delete them, or until your account closes.\n\nYour choices: you can delete any document at any time, which removes it and its reminders.',
    text: 'I agree that MySheba may store the documents and personal details I upload here, and that I am entitled to share them.',
  },
  travel: {
    version: 1,
    details: 'What we collect: your route, travel date, number of passengers, your name, mobile number, and your email address if you give one.\n\nWhy: this is an enquiry, not a booking. An agent uses these details to contact you with prices and availability and to arrange the ticket if you go ahead.\n\nHow long: for as long as needed to handle your enquiry and keep a record of the arrangement.\n\nWho sees it: our travel staff, and the airline or operator if you proceed.\n\nYour choices: contact support to withdraw an enquiry.',
    text: 'I agree that MySheba may collect and process the travel details and contact information I provide here so that an agent can contact me and arrange this booking.',
  },
  remittance: {
    version: 1,
    details: 'What we collect: your name and phone number, and the recipient name, phone number, bank or wallet details, and the identity and address information the transfer requires.\n\nWhy: to carry out the transfer, and because money transfer is regulated - we are obliged to collect and keep certain details about both sides.\n\nHow long: for the period the law requires for money transfer records, which is longer than for most other data here.\n\nWho sees it: our payout partners and the receiving institution, and regulators if they ask.\n\nYour choices: you may decline, but the transfer cannot be sent without this.',
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

/** The longer explanation behind "Read the full terms". */
export function consentDetails(purpose) {
  return CONSENT_PURPOSES[purpose]?.details || '';
}
