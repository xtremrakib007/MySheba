#!/usr/bin/env node
'use strict';
/**
 * Approving a web sign-in from the phone.
 *
 * The browser asks, the phone is asked, somebody taps Approve. It is the same
 * second factor as the emailed code - proof of something the account owner
 * holds - without depending on an inbox, and it tells the owner that a sign-in
 * is being attempted even when it is not them.
 *
 * Everything below is about what must NOT let a browser in: an approval meant
 * for a different browser, one that has expired, one that was rejected, and a
 * rejection being flipped by a second tap.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const approval = require('../functions/webSignInApproval');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const NOW = 1_700_000_000_000;
const req = (over = {}) => ({
  ...approval.newRequest({ deviceId: 'browser-1', label: 'Chrome on Windows', ip: '1.2.3.4', approvalId: 'ap-1', nowMs: NOW }),
  ...over,
});

console.log('\nLetting a browser in');

test('an approval for this browser, in time, lets it in', () => {
  const out = approval.approvalDecision(req({ status: 'approved' }), { deviceId: 'browser-1', nowMs: NOW + 1000 });
  assert.strictEqual(out.ok, true);
});

test('while nobody has answered, the browser waits rather than failing', () => {
  // The browser polls on this, so "not yet" has to be distinguishable from
  // "never" - otherwise it either gives up immediately or retries a refusal.
  const out = approval.approvalDecision(req(), { deviceId: 'browser-1', nowMs: NOW + 1000 });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.retryable, true);
  assert.ok(/Waiting for approval/.test(out.reason), out.reason);
});

console.log('\nAnd the four ways it must not');

test('an approval for another browser does not let this one in', () => {
  // Without this, an approval the owner gave their laptop would admit whichever
  // browser polled next.
  const out = approval.approvalDecision(req({ status: 'approved' }), { deviceId: 'browser-2', nowMs: NOW + 1000 });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.retryable, false);
});

test('an expired approval does not let it in, however it was answered', () => {
  // Checked for approved as well as pending: an approval that sat unused for an
  // hour is not evidence that somebody is at the phone now.
  for (const status of ['pending', 'approved']) {
    const out = approval.approvalDecision(req({ status }), { deviceId: 'browser-1', nowMs: NOW + approval.APPROVAL_TTL_MS });
    assert.strictEqual(out.ok, false, status + ' survived expiry');
    assert.strictEqual(out.retryable, false, status + ' expiry must not be retried');
  }
});

test('a rejection is final and is not retried', () => {
  const out = approval.approvalDecision(req({ status: 'rejected' }), { deviceId: 'browser-1', nowMs: NOW + 1000 });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.retryable, false, 'polling after a refusal turns No into Ask again');
  assert.ok(/rejected on your phone/.test(out.reason), out.reason);
});

test('nothing stored, or nonsense stored, lets nobody in', () => {
  for (const pending of [null, undefined, {}, 'approved', 7, { status: 'approved' }, { deviceId: 'browser-1' }]) {
    assert.strictEqual(approval.approvalDecision(pending, { deviceId: 'browser-1', nowMs: NOW }).ok, false,
      JSON.stringify(pending));
  }
  // An unknown status is not a pass.
  assert.strictEqual(approval.approvalDecision(req({ status: 'maybe' }), { deviceId: 'browser-1', nowMs: NOW }).ok, false);
  // And no device id to compare against is not a pass either.
  assert.strictEqual(approval.approvalDecision(req({ status: 'approved' }), { deviceId: '', nowMs: NOW }).ok, false);
});

console.log('\nAnswering from the phone');

test('the right request, still open, can be answered', () => {
  assert.strictEqual(approval.responseDecision(req(), { approvalId: 'ap-1', nowMs: NOW + 1000 }).ok, true);
});

test('a second tap cannot flip an answer', () => {
  // The dangerous direction is rejected -> approved.
  for (const status of ['approved', 'rejected']) {
    const out = approval.responseDecision(req({ status }), { approvalId: 'ap-1', nowMs: NOW + 1000 });
    assert.strictEqual(out.ok, false, status + ' could be answered again');
    assert.ok(/already answered/.test(out.reason), out.reason);
  }
});

test('an old or wrong id answers nothing', () => {
  assert.strictEqual(approval.responseDecision(req(), { approvalId: 'ap-2', nowMs: NOW }).ok, false);
  assert.strictEqual(approval.responseDecision(req(), { approvalId: '', nowMs: NOW }).ok, false);
  assert.strictEqual(approval.responseDecision(req(), { approvalId: 'ap-1', nowMs: NOW + approval.APPROVAL_TTL_MS }).ok, false);
  assert.strictEqual(approval.responseDecision(null, { approvalId: 'ap-1', nowMs: NOW }).ok, false);
});

test('a request needs a device, an id and a time', () => {
  for (const bad of [{}, { deviceId: 'd' }, { deviceId: 'd', approvalId: 'a' }, { deviceId: '', approvalId: 'a', nowMs: NOW }]) {
    assert.throws(() => approval.newRequest(bad), /needs a device/);
  }
  const made = approval.newRequest({ deviceId: 'd', approvalId: 'a', nowMs: NOW });
  assert.strictEqual(made.status, 'pending');
  assert.strictEqual(made.expiresAt, NOW + approval.APPROVAL_TTL_MS);
});

test('the window is short, because somebody is holding the phone', () => {
  assert.ok(approval.APPROVAL_TTL_MS <= 10 * 60 * 1000, 'too long to be a live prompt');
  assert.ok(approval.APPROVAL_TTL_MS >= 60 * 1000, 'too short to find and unlock a phone');
});

console.log('\nHow the server uses it');

const service = read('functions/deviceSessionService.js');

test('an approval is one of the ways a device becomes verified', () => {
  assert.ok(/approvalDecision\(profile\.pendingWebApproval, \{ deviceId, nowMs: Date\.now\(\) \}\)\.ok/.test(service));
  assert.ok(/verificationMethod = 'app_approval'/.test(service), 'and is recorded as its own method');
  // Used once. Left in place it would admit the same browser again later.
  assert.ok(/pendingWebApproval: FieldValue\.delete\(\)/.test(service), 'it must be consumed');
});

test('the phone is asked when a challenge is raised', () => {
  assert.ok(/const askedApp = await requestAppApproval\(/.test(service));
  assert.ok(/appApprovalSent: askedApp/.test(service), 'the browser must learn whether anything was sent');
});

test('a failed push never blocks a sign-in', () => {
  // The emailed code is the path that must always work.
  const helper = /async function requestAppApproval\([\s\S]*?\n\}/.exec(service);
  assert.ok(helper, 'the helper must be findable');
  assert.ok(/catch \(error\)/.test(helper[0]), 'it must swallow its own failures');
  assert.ok(/return false;/.test(helper[0]));
});

test('answering only changes the status', () => {
  // Rewriting the whole request would let a second answer move the device or
  // the deadline it was agreed against.
  assert.ok(/'pendingWebApproval\.status': approve \? 'approved' : 'rejected'/.test(service));
  assert.ok(!/pendingWebApproval: \{ \.\.\./.test(service), 'the request must not be rewritten wholesale');
});

test('a rejection is recorded, not just discarded', () => {
  assert.ok(/action: approve \? 'web_signin_approved' : 'web_signin_rejected'/.test(service),
    '"somebody tried to sign in as me and I said no" is the point of asking');
});

test('the callable is deployed', () => {
  assert.ok(/exports\.respondToWebSignIn = require\('\.\/deviceSessionService'\)/.test(read('functions/index.js')));
});


// ---------------------------------------------------------------------------
// The phone side. A server that asks a question nobody can answer is worse
// than one that never asked, so the path from the push to the two buttons is
// checked link by link.
// ---------------------------------------------------------------------------

const context = read('src/context/AppContext.js');
const prompt = read('src/components/WebSignInApprovalPrompt.js');
const client = read('src/firebase/webSignInService.js');

test('the push carries what the person needs to recognise the sign-in', () => {
  // The payload itself, not the helper around it - `label` and `ip` are also
  // parameters and go into the push body, so a looser match would pass with
  // the data object empty.
  const payload = /data: \{([^}]*)\}/.exec(read('functions/deviceSessionService.js'));
  assert.ok(payload, 'the push must carry a data payload');
  assert.ok(/type: 'web_signin_approval'/.test(payload[1]), 'the app routes on the type');
  assert.ok(/approvalId: request\.approvalId/.test(payload[1]), 'and cannot answer without the id');
  // Without these the prompt reads "someone, somewhere" and nobody can tell
  // their own sign-in from an intruder's.
  assert.ok(/label: request\.label/.test(payload[1]));
  assert.ok(/ip: request\.ip/.test(payload[1]));
});

test('the app recognises the push', () => {
  assert.ok(/data\.type === "web_signin_approval" && !!data\.approvalId/.test(context),
    'an approval without an id is unanswerable and must not raise a prompt');
});

test('the prompt comes up both on a tap and on arrival', () => {
  // Tapped from the lock screen or the banner.
  assert.ok(/if \(isWebSignInApproval\(data\)\) \{\n\s*showWebSignInApproval\(data\);/.test(context));
  // Or while the app is already open - five minutes is not long enough to
  // wait for somebody to notice a banner.
  assert.ok(/addNotificationReceivedListener\(\(notification\) => \{[\s\S]*?if \(isWebSignInApproval\(data\)\) showWebSignInApproval\(data\);/.test(context));
  assert.ok(/addNotificationReceivedListener,/.test(context), 'the listener must be imported');
});

test('both listeners are cleaned up', () => {
  // A leaked listener fires against a signed-out closure.
  const cleanup = /return \(\) => \{\s*sub\.remove\(\);\s*received\.remove\(\);\s*\};/.test(context);
  assert.ok(cleanup, 'the effect must remove the received listener as well as the tap one');
});

test('the request reaches the prompt', () => {
  assert.ok(/const \[webSignInRequest, setWebSignInRequest\] = useState\(null\)/.test(context));
  // Exposed on the context value, not just held in state.
  const value = context.slice(context.lastIndexOf('    webSignInRequest,'));
  assert.ok(/    webSignInRequest,\n    clearWebSignInRequest,/.test(value), 'both must be on the context');
  assert.ok(/useApp\(\)/.test(prompt) && /webSignInRequest, clearWebSignInRequest/.test(prompt));
});

test('the prompt is mounted where it can always be seen', () => {
  const app = read('App.js');
  assert.ok(/import WebSignInApprovalPrompt from '\.\/src\/components\/WebSignInApprovalPrompt'/.test(app));
  // Beside the other global prompt, outside any screen - the question can
  // arrive on any screen at all.
  assert.ok(/<BiometricOptInPrompt \/><WebSignInApprovalPrompt \/>/.test(app));
});

test('nothing is shown without an id to answer with', () => {
  assert.ok(/if \(!webSignInRequest \|\| !webSignInRequest\.approvalId\) return null;/.test(prompt));
});

test('rejecting is a real answer, not a dismissal', () => {
  assert.ok(/onPress=\{\(\) => answer\(false\)\}/.test(prompt), 'the reject button must call the server');
  assert.ok(/respondToWebSignIn\(approvalId, approve\)/.test(prompt));
  // And it tells the person what to do next, which is the whole value of
  // finding out this way. Pinned to the alert: the same advice sits in the
  // card's warning line, which is on screen before anyone has answered.
  const rejected = /showAlert\('Sign-in rejected',[^)]*\)/.exec(prompt);
  assert.ok(rejected, 'a rejection must be confirmed');
  assert.ok(/change your password/.test(rejected[0]));
});

test('leaving without answering is not an approval', () => {
  // "Decide later" only closes the prompt. The request expires on its own.
  assert.ok(/onPress=\{clearWebSignInRequest\} disabled=\{!!busy\}/.test(prompt));
  const later = prompt.slice(prompt.indexOf('onPress={clearWebSignInRequest} disabled'));
  assert.ok(!/respondToWebSignIn/.test(later), 'it must not send an answer');
});

test('one tap sends one answer', () => {
  // Two approvals racing would answer a request the second tap never saw.
  assert.ok(/if \(busy\) return;/.test(prompt));
  assert.ok(/disabled=\{!!busy\}/.test(prompt));
});

test('the prompt closes only once the answer is in', () => {
  const sent = prompt.indexOf('await respondToWebSignIn(');
  const cleared = prompt.indexOf('clearWebSignInRequest();', sent);
  assert.ok(sent > 0 && cleared > sent, 'it must not clear before the call returns');
  // A failed call keeps the prompt up, so the person can try again.
  const failure = /catch \(error\) \{[\s\S]*?\n    \}/.exec(prompt.slice(sent))[0];
  assert.ok(!/clearWebSignInRequest/.test(failure));
});

test('the answer is sent as a boolean', () => {
  // `approve: approve` from a truthy value would turn a stray string into an
  // approval on the server, where the gate is a strict comparison.
  assert.ok(/approve: approve === true/.test(client));
  assert.ok(/if \(!approvalId\) throw new Error/.test(client), 'and never sent without an id');
});

console.log('\n' + passed + ' checks passed.\n');
