// Customer identity verification service.
// Phone verification happens at registration; this service handles the separate KYC review request.
import { doc, setDoc, onSnapshot, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { getLastFaceRecognition, clearLastFaceRecognition } from './faceRecognitionState';

const REQUESTS = 'verificationRequests';

export async function submitVerificationRequest(uid, { name, phone }, documentUrl, kycData = {}) {
  const front = kycData.frontDocumentUrl || documentUrl || '';
  const back = kycData.backDocumentUrl || '';
  const selfie = kycData.selfieUrl || '';
  const face = getLastFaceRecognition();
  const faceEmbedding = face?.embedding?.length >= 64 ? face.embedding.slice(0, 512) : null;

  try {
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
      // Camera completion and face recognition are separate from liveness.
      liveFaceVerified: kycData.liveFaceVerified === true,
      liveFaceMethod: kycData.liveFaceMethod || 'native_face_recognition',
      faceRecognitionVerified: kycData.faceRecognitionVerified === true || Boolean(faceEmbedding),
      faceRecognitionModel: face?.model || kycData.faceEmbeddingModel || '',
      // Used only by trusted server-side duplicate checking during KYC review.
      faceEmbedding: faceEmbedding || null,
      submittedAt: serverTimestamp(),
    }, { merge: true });
  } finally {
    clearLastFaceRecognition();
  }
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
