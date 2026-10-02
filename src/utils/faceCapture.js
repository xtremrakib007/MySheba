// Driving automatic capture from a normal camera.
//
// The old screen ran two cameras in sequence: ExpoFaceRecognitionView (the
// library's own CameraX preview) for the face challenge, then expo-camera's
// CameraView to take the picture. That is where the camera trouble came from -
// the native view needs patches/@rdnf-magiba+expo-face-recognition to lay out
// at all, and even then handing the device's camera from one view to another
// mid-flow is the fragile part of the flow.
//
// There is a second way into the same models that needs no custom view:
//
//   import { processFace } from '@rdnf-magiba/expo-face-recognition';
//   const result = await processFace(photoUri);   // same FaceRecognitionResult
//
// So one ordinary expo-camera CameraView can do the whole job: take a frame,
// ask processFace whether it holds a live human face, and when it does, send
// that frame on. Nothing switches cameras, and the frame that passed the
// liveness check is the exact frame submitted - the old flow verified one
// frame and then shot a different one ~900ms later.
//
// This module is the decision half, kept free of React and native calls so it
// can be tested on a laptop. See scripts/test-face-capture.js.

import { FACE_STATES, readFaceEvent } from './faceEvent';

/** How long to wait between frames. One-off KYC step, so unhurried. */
export const SAMPLE_INTERVAL_MS = 1200;

/**
 * processFace throwing means the native module is not answering - a missing
 * build, a model that never loaded. A few in a row is a dead end, not a
 * transient miss, and the person should be told rather than left looking at a
 * camera that never reacts.
 */
export const DETECTOR_FAILURE_LIMIT = 3;

export const UNAVAILABLE_MESSAGE =
  'Face verification could not start on this device. Please try another device or contact support.';

export const STARTING_MESSAGE = 'Starting the face check…';

/** What the screen says before any frame has been read. */
export const IDLE_MESSAGE = 'Centre your face in the oval';

/**
 * One frame's outcome -> what the loop does next.
 *
 * @param {{ok: true, result: object} | {ok: false, error: any}} sample
 *   ok:true carries whatever processFace resolved to; ok:false means the call
 *   threw.
 * @param {number} failures consecutive thrown calls before this one.
 * @returns {{action: 'submit'|'retry'|'abort', failures: number, message: string, embedding: number[]|null}}
 */
export function nextCaptureStep(sample, failures = 0) {
  const seen = Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0;

  if (!sample || sample.ok !== true) {
    const next = seen + 1;
    if (next >= DETECTOR_FAILURE_LIMIT) {
      return { action: 'abort', failures: next, message: UNAVAILABLE_MESSAGE, embedding: null };
    }
    return { action: 'retry', failures: next, message: STARTING_MESSAGE, embedding: null };
  }

  // A frame the detector *did* answer for clears the failure streak, whatever
  // it said about the face - the module is plainly working.
  const { state, message, embedding } = readFaceEvent(sample.result);

  if (state === FACE_STATES.READY && embedding) {
    return { action: 'submit', failures: 0, message, embedding };
  }

  return { action: 'retry', failures: 0, message, embedding: null };
}

/**
 * Whether a failed server verification is worth another frame.
 *
 * A duplicate face is settled - the same face will keep coming back duplicate,
 * and retrying every 1.2s would just hammer a rate-limited callable. Anything
 * else (network, a transient server error) deserves another go.
 */
export function isRetryableVerificationFailure(result) {
  return !result?.duplicate;
}
