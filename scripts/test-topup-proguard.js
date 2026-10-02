#!/usr/bin/env node
'use strict';

/**
 * Two faults that only showed up on a real device.
 *
 * TOP-UP. createTopupRequest(payload, requestId) was being called with a
 * {uid, phone, name, role} object in the requestId slot - the leftover of an
 * older signature - so every submission came back
 *
 *   requestId is required and must be 16-128 safe characters. [400]
 *
 * The server reads the submitter from request.auth and the user document, so
 * none of that object was ever needed. The id now comes from the service and
 * is held across retries, because submitTopupRequest de-duplicates on it
 * (topupSubmissionOperations/{uid}_{requestId}) - a fresh id per tap would
 * turn one lost response into two top-up requests.
 *
 * KYC. The selfie screen printed
 *
 *   Field platform_ for Q8.u not found. Known fields are [private int Q8.u.e, ...]
 *
 * Obfuscated class names in a field-not-found error are a stripped protobuf
 * field. @rdnf-magiba/expo-face-recognition runs MediaPipe Tasks Vision on
 * LiteRT, MediaPipe configures its graph with protobuf messages read
 * reflectively, and release builds have R8 on. Nothing in the repo kept them.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\nThe top-up sends a real request id');

const screen = read('src/screens/TopUpScreen.js');
const service = read('src/firebase/topupService.js');

check('the service hands one out', /export function newTopupRequestId/.test(service));
check('the screen asks it for one', /topupService\.newTopupRequestId\(\)/.test(screen));
// The bug: an object in the requestId slot. Assert the shape is gone.
check('and no longer passes a user object instead',
  !/createTopupRequest\(\s*\{[\s\S]{0,200}\},\s*\{\s*uid:/.test(screen));
check('it survives a retry as the same id', /requestIdRef\.current/.test(screen));
check('and is only released after a success',
  /requestIdRef\.current = null;/.test(screen) && screen.indexOf('requestIdRef.current = null;') > screen.indexOf('createTopupRequest('));

// Whatever the client sends still has to satisfy the server.
const server = read('functions/topupSubmissionService.js');
const re = (server.match(/const REQUEST_ID_RE = (\/.*\/);/) || [])[1];
check('the server rule is still readable', Boolean(re), 'REQUEST_ID_RE not found');
if (re) {
  // eslint-disable-next-line no-eval
  const pattern = eval(re);
  const sample = `topup_${'0123abcd-4567-89ef-0123-456789abcdef'}`;
  check('a generated id matches it', pattern.test(sample), sample);
  check('and an object stringified does not', !pattern.test(String({ uid: 'x' })));
}

console.log('\nR8 keeps what the face detector reads reflectively');

const app = JSON.parse(read('app.base.json'));
const bp = (app.expo.plugins || []).find((p) => Array.isArray(p) && p[0] === 'expo-build-properties');
check('expo-build-properties is still configured', Boolean(bp));
const android = (bp && bp[1] && bp[1].android) || {};
// The rules only matter because minification is on; if that ever goes off the
// rules are harmless, but if it is on with no rules the detector dies again.
check('release builds still minify', android.enableProguardInReleaseBuilds === true);
const rules = android.extraProguardRules || '';
check('protobuf generated fields are kept',
  /-keepclassmembers class \* extends com\.google\.protobuf\.GeneratedMessageLite \{ <fields>; \}/.test(rules));
for (const pkg of ['com.google.mediapipe', 'com.google.ai.edge.litert', 'org.tensorflow.lite']) {
  check(`${pkg} is kept`, new RegExp(`-keep class ${pkg.replace(/\./g, '\\.')}\\.\\*\\* \\{ \\*; \\}`).test(rules));
}

// The rules are only worth anything if that library is actually the detector.
const pkgJson = JSON.parse(read('package.json'));
check('the face library is still the MediaPipe one',
  Boolean(pkgJson.dependencies['@rdnf-magiba/expo-face-recognition']));

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Top-up sends a valid id; R8 keeps MediaPipe intact.');
