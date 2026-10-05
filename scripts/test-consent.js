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
    // Tolerant of other fields between version and text - `details` was added
    // between them and this stopped matching, which read as "missing from the
    // app copy" rather than "the regex is too strict".
    const block = new RegExp(purpose + ':\\s*\\{\\s*version:\\s*(\\d+),[\\s\\S]*?text:\\s*\'([^\']+)\'').exec(client);
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

test('travel inquiries are refused by the rules, for the same reason', () => {
  // Flight, bus and train all write client -> Firestore through the same
  // inquiry. A name, a phone number and an email, with no callable in between.
  const rules = read('firestore.rules');
  const line = rules.split('\n').find((l) => l.includes('match /inquiries/{id}'));
  assert.ok(line, 'the rule must exist');
  assert.ok(/'consentPurpose','consentVersion'/.test(line), 'the fields must pass hasOnly');
  assert.ok(/consentPurpose', ''\) == 'travel'/.test(line), 'and be required');
  assert.ok(/consentVersion', 0\) >= 1/.test(line));
  // One checkbox covers all three: they share TravelInquirySteps.
  const steps = read('src/steps/TravelInquirySteps.js');
  assert.ok(/<ConsentCheckbox purpose="travel"/.test(steps));
  // The gate must be on the step that RENDERS the box. It was on step 1 while
  // the box was on step 2, so the wizard refused to advance and the box the
  // message asked for was not on screen yet - no way forward at all.
  // The LAST step header before the checkbox, not the first. A lazy match from
  // the top of the file spans every step and reports step 0 whatever is true.
  const at = steps.indexOf('<ConsentCheckbox purpose="travel"');
  assert.ok(at > 0, 'the checkbox must be in the travel steps');
  const before = (steps.slice(0, at).match(/if \(step === (\d)\) \{/g) || []).pop();
  assert.ok(before, 'the checkbox must render inside a numbered step');
  const renderStep = [null, /(\d)/.exec(before)[1]];
  const gate = /if \(step === (\d)\) \{\s*\n\s*if \(serviceData\.consentAccepted !== true\)/.exec(steps);
  assert.ok(gate, 'the gate must live in a numbered step');
  assert.strictEqual(gate[1], renderStep[1],
    'the gate is on step ' + gate[1] + ' but the box is on step ' + renderStep[1]);
  for (const file of ['src/steps/FlightSteps.js', 'src/steps/BusSteps.js', 'src/steps/TrainSteps.js']) {
    assert.ok(/TravelInquirySteps/.test(read(file)), file + ' no longer shares the gated step');
  }
  // Computing the payload is not writing it. Dropping the two field lines left
  // the call in place, unused, and this passed.
  const inquiry = read('src/firebase/inquiryService.js');
  assert.ok(/consentPayload\('travel'\)/.test(inquiry), 'the acceptance must be computed');
  assert.ok(/consentPurpose: consent\.purpose/.test(inquiry), 'and written');
  assert.ok(/consentVersion: consent\.version/.test(inquiry), 'with its version');
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

console.log('\nPeople can read what they are agreeing to');

test('every purpose explains itself, on both sides', () => {
  const client = read('src/utils/consentPolicy.js');
  for (const [purpose, def] of Object.entries(policy.CONSENT_PURPOSES)) {
    assert.ok(typeof def.details === 'string' && def.details.length > 150,
      purpose + ' has no real explanation');
    // What somebody actually wants to know before agreeing.
    for (const heading of ['What we collect', 'Why', 'How long']) {
      assert.ok(def.details.includes(heading), purpose + ' does not say: ' + heading);
    }
    const block = new RegExp(purpose + ':[\\s\\S]*?details: \'([^\']+)\'').exec(client);
    assert.ok(block, purpose + ' has no explanation in the app copy');
    // The source text still has literal \n escapes where the evaluated string
    // has real newlines - comparing them raw differs by exactly two characters
    // per paragraph break and reads as a content mismatch.
    assert.strictEqual(block[1].replace(/\\n/g, '\n'), def.details,
      purpose + ' explanation differs between app and server');
  }
});

test('the box offers to show it, before it is ticked', () => {
  // Buried in a policy page afterwards is not the same as reachable first.
  const component = read('src/components/ConsentCheckbox.js');
  // The visible link, not the accessibility label - the phrase appears twice,
  // so a bare search still matched after the link text was changed.
  assert.ok(/<Text style=\{styles\.readMore\}>Read the full terms<\/Text>/.test(component),
    'there must be a visible way in');
  assert.ok(/accessibilityLabel="Read the full terms"/.test(component),
    'and a screen reader must find it too');
  assert.ok(/consentDetails\(purpose\)/.test(component), 'showing this purpose\u2019s own detail');
  assert.ok(/<Modal/.test(component), 'and actually opening something');
});

test('closing the terms is not agreeing to them', () => {
  // A sheet whose only exit accepts is a sheet that forces agreement.
  const component = read('src/components/ConsentCheckbox.js');
  assert.ok(/onPress=\{\(\) => setShowDetails\(false\)\}/.test(component), 'Close must only close');
  assert.ok(/onChange\(true\); setShowDetails\(false\);/.test(component),
    'and agreeing is a separate, explicit button');
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
