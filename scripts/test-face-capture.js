#!/usr/bin/env node
/**
 * The automatic-capture loop's decisions.
 *
 * The KYC selfie now comes from one ordinary expo-camera CameraView: take a
 * frame, ask processFace whether it holds a live face, submit the first frame
 * that does. The old flow ran the library's own native camera view for the
 * challenge and then switched to CameraView to shoot, which is both where the
 * camera trouble lived and why a different frame was submitted than the one
 * verified.
 *
 * The loop itself needs a device. These are the decisions it makes, which do
 * not - so they get checked here instead of on a phone.
 *
 * The processFace payloads below are the FaceRecognitionResult shapes from the
 * library's own types (ExpoFaceRecognition.types.d.ts).
 */
const esbuild = require('esbuild');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');

// faceCapture imports faceEvent, so both go into one sandbox with a tiny
// require shim standing in for the module graph.
function load(file) {
  return esbuild.transformSync(fs.readFileSync(path.join(root, 'src', 'utils', file), 'utf8'), {
    loader: 'js',
    format: 'cjs',
  }).code;
}

const faceEventBox = { module: { exports: {} }, exports: {} };
faceEventBox.module.exports = faceEventBox.exports;
vm.createContext(faceEventBox);
vm.runInContext(load('faceEvent.js'), faceEventBox);

const box = {
  module: { exports: {} },
  exports: {},
  require: (id) => {
    if (id === './faceEvent') return faceEventBox.module.exports;
    throw new Error(`unexpected require: ${id}`);
  },
};
box.module.exports = box.exports;
vm.createContext(box);
vm.runInContext(load('faceCapture.js'), box);

const {
  nextCaptureStep,
  isRetryableVerificationFailure,
  DETECTOR_FAILURE_LIMIT,
  SAMPLE_INTERVAL_MS,
  UNAVAILABLE_MESSAGE,
} = box.module.exports;

let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const embedding = Array.from({ length: 512 }, (_, i) => (i % 7) * 0.01);

console.log('\nAutomatic capture decisions');

// The whole point: a live face with an embedding is submitted, and it is the
// frame just read, not a later one.
const live = nextCaptureStep(
  { ok: true, result: { success: true, isLive: true, isWearingGlasses: false, embedding, rect: {}, duration: {} } },
  0
);
check('a live face submits', live.action === 'submit', `got ${live.action}`);
check('and carries the embedding', Array.isArray(live.embedding) && live.embedding.length === 512);

// Everything the detector can say that is not a usable face keeps the loop
// running, with the library's own wording reaching the screen.
const noFace = nextCaptureStep({ ok: true, result: { success: false, error: 'No face detected' } }, 0);
check('no face retries', noFace.action === 'retry', `got ${noFace.action}`);
check('no face says so', /no face detected/i.test(noFace.message), noFace.message);
check('no face sends nothing', noFace.embedding === null);

const spoof = nextCaptureStep({ ok: true, result: { success: true, isLive: false, rect: {}, duration: {} } }, 0);
check('a photo-of-a-photo retries, never submits', spoof.action === 'retry', `got ${spoof.action}`);
check('and is told it must be a real face', /own face|photo or screen/i.test(spoof.message), spoof.message);

const glasses = nextCaptureStep(
  { ok: true, result: { success: true, isLive: true, isWearingGlasses: true, rect: {}, duration: {} } },
  0
);
check('glasses retries', glasses.action === 'retry', `got ${glasses.action}`);
check('and asks for them off', /glasses/i.test(glasses.message), glasses.message);

// A live face whose embedding is the wrong length must not be submitted: the
// server compares 512-float vectors and anything else is not comparable.
const shortVector = nextCaptureStep(
  { ok: true, result: { success: true, isLive: true, isWearingGlasses: false, embedding: [1, 2, 3], rect: {}, duration: {} } },
  0
);
check('a malformed embedding is not submitted', shortVector.action === 'retry', `got ${shortVector.action}`);

console.log('\nWhen the native module is not answering');

// This is the failure the old screen handled worst: it left the person looking
// at a camera that never reacted.
let failures = 0;
const seen = [];
for (let i = 0; i < DETECTOR_FAILURE_LIMIT; i += 1) {
  const step = nextCaptureStep({ ok: false, error: new Error('native module not found') }, failures);
  failures = step.failures;
  seen.push(step.action);
}
check(
  `retries then gives up after ${DETECTOR_FAILURE_LIMIT}`,
  seen.slice(0, -1).every((a) => a === 'retry') && seen[seen.length - 1] === 'abort',
  seen.join(',')
);
check(
  'and explains it rather than hanging',
  nextCaptureStep({ ok: false, error: new Error('x') }, DETECTOR_FAILURE_LIMIT - 1).message === UNAVAILABLE_MESSAGE
);

// A detector that answers is plainly working, so an earlier blip must not
// count towards the limit for ever.
const recovered = nextCaptureStep({ ok: true, result: { success: false, error: 'No face detected' } }, 2);
check('an answered frame clears the failure streak', recovered.failures === 0, `got ${recovered.failures}`);
check('a cleared streak does not abort', recovered.action === 'retry', `got ${recovered.action}`);

// Guard the inputs the loop can actually hand this function.
check('a missing sample counts as a failure', nextCaptureStep(undefined, 0).failures === 1);
check('a negative streak cannot underflow', nextCaptureStep({ ok: false }, -5).failures === 1);

console.log('\nServer verification outcomes');

check('a duplicate face stops the loop', isRetryableVerificationFailure({ duplicate: true }) === false);
check('any other failure may retry', isRetryableVerificationFailure({ ok: false }) === true);
check('an absent result may retry', isRetryableVerificationFailure(undefined) === true);

console.log('\nPacing');
check(
  'the sample interval is a sane one-off-step cadence',
  SAMPLE_INTERVAL_MS >= 500 && SAMPLE_INTERVAL_MS <= 3000,
  String(SAMPLE_INTERVAL_MS)
);

console.log('\nNo second camera');

// The reason this change exists: the component must not mount the library's
// native preview view, and must not hold a second camera.
const component = fs.readFileSync(path.join(root, 'src', 'components', 'LiveFaceCapture.js'), 'utf8');
check(
  'LiveFaceCapture does not mount ExpoFaceRecognitionView',
  !/ExpoFaceRecognitionView/.test(component)
);
check('it uses processFace instead', /\bprocessFace\b/.test(component));
check(
  'it renders exactly one CameraView',
  (component.match(/<CameraView/g) || []).length === 1,
  String((component.match(/<CameraView/g) || []).length)
);
check(
  'it keeps no capture button',
  !/takePictureAsync/.test(component.split('const styles')[0].replace(/[\s\S]*?tick = async/, '')) ||
    !/onPress=\{[^}]*(capture|shoot|takePicture)/i.test(component)
);
check(
  'rejected frames are deleted rather than left in the cache',
  /deleteAsync/.test(component)
);

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Automatic face capture behaves as intended.');
