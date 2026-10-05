#!/usr/bin/env node
'use strict';
/**
 * Consent, recorded rather than merely asked for.
 *
 * The app collects an IC number, a passport number, a selfie, photographs of
 * identity documents, and both parties' home addresses on a remittance. None of
 * it carried any record that the person agreed. The KYC screen showed a
 * sentence nobody had to acknowledge and which was stored nowhere.
 *
 * A checkbox alone would not have fixed that, which is most of what this
 * covers: the tick is required where the data LANDS, not only where it is
 * asked for. Three of the four paths go through callables a modified client can
 * call directly, and the fourth - documents - is written by the client straight
 * into Firestore, so there the rule is the only possible gate.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const policy = require('../functions/consentPolicy');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nWhat counts as consent');

test('a ticked box for the right purpose and version', () => {
  const out = policy.readConsent({ accepted: true, purpose: 'kyc', version: 1 }, 'kyc');
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.consent.purpose, 'kyc');
  assert.strictEqual(out.consent.version, 1);
  // The wording comes back so it can be stored verbatim - reading it later from
  // a policy file that has since changed would give the current words, not the
  // ones the person saw.
  assert.ok(out.consent.text.length > 20);
});

test('only the boolean true, not anything truthy', () => {
  // 'false', 'no' and 1 are all truthy. None of them is somebody ticking a box,
  // and a client that sends one is a client that did not ask.
  for (const accepted of [false, 'true', 'false', 'yes', 1, 0, null, undefined, {}]) {
    assert.strictEqual(policy.readConsent({ accepted, purpose: 'kyc', version: 1 }, 'kyc').ok, false,
      JSON.stringify(accepted) + ' was accepted');
  }
});

test('consent for one thing is not consent for another', () => {
  // Agreeing to store a document is not agreeing to hand over a passport
  // number for a remittance.
  const out = policy.readConsent({ accepted: true, purpose: 'documents', version: 1 }, 'remittance');
  assert.strictEqual(out.ok, false);
  assert.ok(/for something else/.test(out.reason), out.reason);
});

test('an old version does not cover new wording', () => {
  // This is why the version is stored at all. Accepting a stale one would
  // record agreement to words the person never saw.
  for (const version of [0, -1, 2, 1.5, '1', null, undefined]) {
    const out = policy.readConsent({ accepted: true, purpose: 'kyc', version }, 'kyc');
    if (version === 1) continue;
    assert.strictEqual(out.ok, false, 'version ' + JSON.stringify(version) + ' was accepted');
  }
  assert.strictEqual(policy.readConsent({ accepted: true, purpose: 'kyc', version: 1 }, 'kyc').ok, true);
});

test('nothing at all is refused, and an unknown purpose too', () => {
  for (const given of [null, undefined, {}, [], 'yes', 7]) {
    assert.strictEqual(policy.readConsent(given, 'kyc').ok, false, JSON.stringify(given));
  }
  assert.strictEqual(policy.readConsent({ accepted: true, purpose: 'x', version: 1 }, 'x').ok, false);
});

console.log('\nThe app shows the words the server records');

test('every purpose has identical text and version on both sides', () => {
  // They cannot import each other - one ships in the app bundle, the other runs
  // in Cloud Functions - so this is what stops a stored version pointing at
  // wording nobody was shown.
  const client = read('src/utils/consentPolicy.js');
  for (const [purpose, def] of Object.entries(policy.CONSENT_PURPOSES)) {
    const block = new RegExp(purpose + ':\\s*\\{\\s*version:\\s*(\\d+),\\s*text:\\s*\'([^\']+)\'').exec(client);
    assert.ok(block, purpose + ' is missing from the app copy');
    assert.strictEqual(Number(block[1]), def.version, purpose + ' version differs');
    assert.strictEqual(block[2], def.text, purpose + ' wording differs');
  }
});

test('the app offers no purpose the server does not know', () => {
  const client = read('src/utils/consentPolicy.js');
  const declared = (client.match(/^  (\w+): \{$/gm) || []).map((l) => l.trim().replace(':', '').replace(' {', ''));
  for (const purpose of declared) {
    assert.ok(policy.CONSENT_KEYS.includes(purpose), purpose + ' would be refused by the server');
  }
});

console.log('\nRequired where the data lands');

test('KYC refuses a submission without it', () => {
  const src = read('functions/diditKycService.js');
  assert.ok(/requireConsent\(db,uid,request\.data\?\.consent,'kyc'/.test(src), 'the callable must require it');
  // Before the data is read, not after it is stored.
  assert.ok(src.indexOf("requireConsent(db,uid,request.data?.consent,'kyc'") < src.indexOf('frontDocumentUrl:'),
    'consent must be required before the documents are read');
});

test('remittance refuses a charge without it', () => {
  const src = read('functions/walletService.js');
  assert.ok(/if\(service==='remittance'\)await requireConsent\(/.test(src), 'the charge must require it');
  assert.ok(src.indexOf("service==='remittance')await requireConsent") < src.indexOf('const rates=await getRates'),
    'consent must be required before anything is priced or charged');
});

test('documents are refused by the rules, because nothing else can refuse them', () => {
  // This write goes client -> Firestore with no callable in between.
  const rules = read('firestore.rules');
  const line = rules.split('\n').find((l) => l.includes('match /myDocuments/{id}'));
  assert.ok(line, 'the rule must exist');
  assert.ok(/consentPurpose', '''?\) == 'documents'|consentPurpose', ''\) == 'documents'/.test(line)
    || /consentPurpose/.test(line), 'the rule must require a consent purpose');
  assert.ok(/consentVersion', 0\) >= 1/.test(line), 'and a version');
  assert.ok(/'consentPurpose','consentVersion'/.test(line), 'and allow the fields through hasOnly');
});

test('the client sends what each gate expects', () => {
  assert.ok(/consentPayload\('kyc'\)/.test(read('src/firebase/verificationService.js')));
  assert.ok(/consentPayload\('documents'\)/.test(read('src/firebase/documentService.js')));
  assert.ok(/consentPurpose: consent\.purpose/.test(read('src/firebase/documentService.js')));
});

test('remittance sends it only when the box was actually ticked', () => {
  // Sending it unconditionally would record an acceptance from somebody who
  // never gave one - the exact failure the record exists to avoid.
  const src = read('src/firebase/transactionService.js');
  assert.ok(/payload\.raw\?\.consentAccepted === true/.test(src),
    'the acceptance must be conditional on the tick');
  assert.ok(/\.\.\.\(consent \? \{ consent \} : \{\}\)/.test(src),
    'and omitted entirely when it was not given');
});

console.log('\nThe box itself');

test('one component, used by every screen that collects personal data', () => {
  const component = read('src/components/ConsentCheckbox.js');
  assert.ok(/accessibilityRole="checkbox"/.test(component), 'it must read as a checkbox');
  assert.ok(/accessibilityState=\{\{ checked: !!value \}\}/.test(component));
  assert.ok(/consentText\(purpose\)/.test(component), 'the words must come from the shared policy');
  for (const screen of ['src/screens/VerifyIdentityScreen.js', 'src/screens/AddDocumentScreen.js', 'src/steps/RemittanceSteps.js']) {
    assert.ok(/<ConsentCheckbox/.test(read(screen)), screen + ' has no checkbox');
  }
});

test('and the submit waits for it', () => {
  assert.ok(/disabled=\{submitting \|\| !consentGiven\}/.test(read('src/screens/VerifyIdentityScreen.js')),
    'KYC submit must wait for the tick');
  assert.ok(/disabled=\{saving \|\| !consentGiven\}/.test(read('src/screens/AddDocumentScreen.js')),
    'document save must wait for the tick');
  assert.ok(/serviceData\.consentAccepted !== true\) return 'Please tick the box/.test(read('src/steps/RemittanceSteps.js')),
    'remittance must not advance without the tick');
});

test('the KYC screen no longer claims agreement nobody gave', () => {
  // It used to state "By submitting, you confirm..." as a sentence with no
  // acknowledgement and no record.
  const src = read('src/screens/VerifyIdentityScreen.js');
  assert.ok(!/By submitting, you confirm that the information and documents are accurate/.test(src),
    'the unacknowledged sentence must be gone');
});

console.log('\nThe record is the server’s, not the client’s');

test('the uid, the clock and the wording are all server-side', () => {
  const src = read('functions/consentRecord.js');
  assert.ok(/acceptedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/.test(src),
    'a client-chosen timestamp proves nothing');
  assert.ok(/text: result\.consent\.text/.test(src), 'the wording must be copied in, not referenced');
  assert.ok(/throw new HttpsError\('failed-precondition', result\.reason\)/.test(src),
    'it must throw, so a caller cannot continue without it');
});

console.log('\n' + passed + ' checks passed.\n');
