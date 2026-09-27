#!/usr/bin/env node
/**
 * Reading the face-recognition view's real event.
 *
 * LiveFaceCapture read `value.faces[0].headEulerAngleY`. The library emits
 * neither - no faces array, no head angle anywhere (verified against
 * ExpoFaceRecognitionView.kt, onFaceDetected). So the first branch always
 * returned and verification could never progress past the first prompt,
 * whatever the person did with their head.
 *
 * The payloads below are copied from that Kotlin source.
 */
const esbuild = require('esbuild');
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const code = esbuild.transformSync(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'faceEvent.js'), 'utf8'),
  { loader: 'js', format: 'cjs' }).code;
const box = { module: { exports: {} }, exports: {} };
box.module.exports = box.exports; vm.createContext(box); vm.runInContext(code, box);
const { readFaceEvent, readEmbedding, FACE_STATES } = box.module.exports;

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};

const rect = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
const embedding512 = Array.from({ length: 512 }, (_, i) => i / 512);

console.log('\n-- the payloads ExpoFaceRecognitionView.kt actually sends --');
is('no face -> asks them into the frame',
   readFaceEvent({ success: false, error: 'No face detected' }).state, FACE_STATES.NO_FACE);
is('a photo or screen -> refused as spoof',
   readFaceEvent({ success: true, isLive: false, rect }).state, FACE_STATES.SPOOF);
is('glasses -> asks for them off (native sends no embedding here)',
   readFaceEvent({ success: true, isLive: true, isWearingGlasses: true, rect }).state, FACE_STATES.GLASSES);
is('a clean face with an embedding -> ready to verify',
   readFaceEvent({ success: true, isLive: true, isWearingGlasses: false, embedding: embedding512, rect }).state,
   FACE_STATES.READY);
is('   and it hands the embedding over',
   readFaceEvent({ success: true, isLive: true, isWearingGlasses: false, embedding: embedding512, rect }).embedding.length, 512);

console.log('\n-- order matters: a spoofed face must not reach verification --');
is('spoof wins over a present embedding',
   readFaceEvent({ success: true, isLive: false, isWearingGlasses: false, embedding: embedding512 }).embedding, null);
is('failure wins over everything',
   readFaceEvent({ success: false, error: 'No face detected', embedding: embedding512 }).embedding, null);

console.log('\n-- embeddings are only trusted at the right size --');
is('512 floats is what facenet_512 produces', readEmbedding({ embedding: embedding512 }).length, 512);
is('192 is not', readEmbedding({ embedding: Array(192).fill(0.5) }), null);
is('a NaN in the vector is not', readEmbedding({ embedding: [...Array(511).fill(0.1), NaN] }), null);
is('not an array is not', readEmbedding({ embedding: 'nope' }), null);
is('absent is not', readEmbedding({}), null);

console.log('\n-- the shape the old code expected never appears --');
is('a faces array is not a usable event',
   readFaceEvent({ faces: [{ headEulerAngleY: 0 }] }).state, FACE_STATES.WAITING);
is('an empty event does not crash', readFaceEvent(undefined).state, FACE_STATES.WAITING);
is('a real error message is passed through, not swallowed',
   readFaceEvent({ success: false, error: 'Camera unavailable' }).message, 'Camera unavailable');

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
