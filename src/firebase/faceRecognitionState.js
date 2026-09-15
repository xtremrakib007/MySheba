// Short-lived in-memory handoff from the native KYC camera to the KYC submitter.
// The biometric template is never persisted here; verificationService persists it
// only as part of the pending KYC request for server-side duplicate checking.
let lastFace = null;

export function setLastFaceRecognition(result) {
  lastFace = result && Array.isArray(result.embedding)
    ? {
        embedding: result.embedding.map(Number).filter(Number.isFinite),
        model: result.model || 'MobileFaceNet',
      }
    : null;
}

export function getLastFaceRecognition() {
  return lastFace;
}

export function clearLastFaceRecognition() {
  lastFace = null;
}
