// Reading what the face-recognition view actually emits.
//
// LiveFaceCapture was written against an API this library does not have. It
// did this:
//
//   const faces = Array.isArray(value.faces) ? value.faces : [];
//   if (faces.length === 0) { setStatus('No face detected'); return; }
//   const yaw = Number(face?.headEulerAngleY ?? face?.rotationY ?? 0);
//
// There is no `faces` array in the event and no head angle anywhere in the
// library. The native view emits a flat object (see
// ExpoFaceRecognitionView.kt, onFaceDetected):
//
//   { success: false, error: 'No face detected' }
//   { success: true, isLive: false, rect, duration }                 spoof
//   { success: true, isLive: true, isWearingGlasses: true, ... }     glasses
//   { success: true, isLive: true, isWearingGlasses: false,
//     embedding: number[512], rect, duration }                       usable
//
// So `value.faces` was always undefined, the first branch always returned,
// and verification could never progress past "Look straight at the camera"
// no matter what the person did. The turn-left/turn-right challenge the
// instructions asked for was unobservable too - the library reports
// liveness through its own spoof detector, not head angles.

export const FACE_STATES = {
  NO_FACE: 'no_face',
  SPOOF: 'spoof',
  GLASSES: 'glasses',
  READY: 'ready',
  WAITING: 'waiting',
};

const EMBEDDING_LENGTH = 512; // facenet_512.tflite

export function readEmbedding(value) {
  const candidate = value?.embedding || value?.recognition?.embedding;
  if (!Array.isArray(candidate)) return null;
  const numbers = candidate.map(Number);
  if (numbers.length !== EMBEDDING_LENGTH) return null;
  return numbers.every(Number.isFinite) ? numbers : null;
}

/**
 * Turns one native event into what the screen should say and whether there
 * is an embedding worth verifying.
 *
 * @returns {{state: string, message: string, embedding: number[]|null}}
 */
export function readFaceEvent(nativeEvent) {
  const value = nativeEvent || {};

  if (value.success === false) {
    // The library's own wording is "No face detected"; anything else is a
    // real error worth showing as-is.
    const error = String(value.error || '');
    return {
      state: FACE_STATES.NO_FACE,
      message: /no face/i.test(error) || !error
        ? 'No face detected — move into the frame'
        : error,
      embedding: null,
    };
  }

  if (value.isLive === false) {
    return {
      state: FACE_STATES.SPOOF,
      message: 'Use your own face — a photo or screen will not pass',
      embedding: null,
    };
  }

  if (value.isWearingGlasses === true) {
    // The native side returns early here and sends no embedding at all.
    return {
      state: FACE_STATES.GLASSES,
      message: 'Please remove your glasses and look at the camera',
      embedding: null,
    };
  }

  const embedding = readEmbedding(value);
  if (!embedding) {
    return {
      state: FACE_STATES.WAITING,
      message: 'Hold still — reading your face',
      embedding: null,
    };
  }

  return {
    state: FACE_STATES.READY,
    message: 'Hold still — verifying your face',
    embedding,
  };
}
