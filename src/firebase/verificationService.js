// Customer identity verification service.
// Phone verification happens at registration; this service handles the separate KYC review request.
import { doc, setDoc, onSnapshot, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const REQUESTS = 'verificationRequests';

export async function verifyNativeKycFace(embedding, livenessPassed = true) {
  // The deployed callable keeps its historical name for backwards compatibility,
  // but it no longer calls any third-party KYC provider. It performs the native
  // 512-d embedding duplicate check on the server.
  const fn = httpsCallable(functions, 'createDiditKycSession');
  const result = await fn({ embedding, livenessPassed });
  return result.data || {};
}

export async function submitVerificationRequest(uid, { name, phone }, documentUrl, kycData = {}) {
  const front = kycData.frontDocumentUrl || documentUrl || '';
  const back = kycData.backDocumentUrl || '';
  const selfie = kycData.selfieUrl || '';

  // Keep only the information required by the current four-step KYC flow:
  // identity, document, residential address and live-face verification.
  // Do not persist legacy occupation/employer/source-of-funds fields.
  await setDoc(doc(db, REQUESTS, uid), {
    uid,
    name: name || '',
    phone: phone || '',
    documentUrl: front,
    documentType: kycData.documentType || '',
    documentNumber: kycData.documentNumber || '',
    nationality: kycData.nationality || '',
    dateOfBirth: kycData.dateOfBirth || '',
    gender: kycData.gender || '',
    address: kycData.address || '',
    passportExpiryDate: kycData.passportExpiryDate || '',
    frontDocumentUrl: front,
    backDocumentUrl: back,
    selfieUrl: selfie,
    frontImageUrl: front,
    backImageUrl: back,
    selfieImageUrl: selfie,
    status: 'pending',
    note: '',
    rejectionReason: '',
    liveFaceVerified: kycData.liveFaceVerified === true,
    liveFaceMethod: kycData.liveFaceMethod || 'native_face_recognition',
    biometricModel: kycData.biometricModel || 'mobilefacenet-512',
    submittedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeMyVerificationRequest(uid, callback, onError) {
  if (!uid) { callback(null); return () => {}; }
  return onSnapshot(doc(db, REQUESTS, uid), (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export function subscribePendingVerifications(callback, onError) {
  const q = query(collection(db, REQUESTS), where('status', '==', 'pending'), orderBy('submittedAt', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function approveVerification(targetUid) {
  const fn = httpsCallable(functions, 'approveVerification');
  await fn({ targetUid });
}

export async function rejectVerification(targetUid, reason) {
  const fn = httpsCallable(functions, 'rejectVerification');
  await fn({ targetUid, reason });
}
