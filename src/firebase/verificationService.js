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
    occupation: kycData.occupation || '',
    skilledLabour: kycData.skilledLabour || '',
    companyName: kycData.companyName || '',
    employerName: kycData.employerName || '',
    address: kycData.address || '',
    passportPlaceOfIssue: kycData.passportPlaceOfIssue || '',
    passportIssueDate: kycData.passportIssueDate || '',
    passportExpiryDate: kycData.passportExpiryDate || '',
    sourceOfFunds: kycData.sourceOfFunds || '',
    frontDocumentUrl: front,
    backDocumentUrl: back,
    selfieUrl: selfie,
    frontImageUrl: front,
    backImageUrl: back,
    selfieImageUrl: selfie,
    status: 'pending',
    note: '',
    rejectionReason: '',
    // This is set only after verifyNativeKycFace has passed. It means the
    // native biometric challenge and duplicate-face check completed.
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
