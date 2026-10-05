// Customer identity verification service.
// Phone verification happens at registration; this service handles the separate KYC review request.
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { consentPayload } from '../utils/consentPolicy';

const REQUESTS = 'verificationRequests';

export async function verifyNativeKycFace(embedding, livenessPassed = true) {
  const fn = httpsCallable(functions, 'createDiditKycSession');
  const result = await fn({ embedding, livenessPassed });
  return result.data || {};
}

export async function submitVerificationRequest(uid, { name }, documentUrl, kycData = {}) {
  if (!uid) throw new Error('You must be signed in.');
  const front = kycData.frontDocumentUrl || documentUrl || '';
  const back = kycData.backDocumentUrl || '';
  const selfie = kycData.selfieUrl || '';

  // KYC requests are created only by the trusted callable. The client can
  // upload evidence, but cannot choose status, phone, review fields, or
  // overwrite an existing pending/approved request directly in Firestore.
  const fn = httpsCallable(functions, 'createDiditKycSession');
  const result = await fn({
    mode: 'submit',
    // The callable refuses a submission without this. Identity documents and a
    // selfie are what it is for.
    consent: consentPayload('kyc'),
    kycData: {
      uid,
      name: name || '',
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
      liveFaceVerified: kycData.liveFaceVerified === true,
      liveFaceMethod: kycData.liveFaceMethod || 'front_camera_challenge',
      biometricModel: kycData.biometricModel || 'mobilefacenet-512',
    },
  });
  return result.data || {};
}

export function subscribeMyVerificationRequest(uid, callback, onError) {
  if (!uid) { callback(null); return () => {}; }
  return onSnapshot(doc(db, REQUESTS, uid), (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export function subscribePendingVerifications(callback, onError) {
  const q = query(collection(db, REQUESTS), where('status', '==', 'pending'), orderBy('submittedAt', 'asc'), limit(100));
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
