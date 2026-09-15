// Customer identity verification service.
// Phone verification happens at registration; this service handles the separate KYC review request.
import { doc, setDoc, onSnapshot, collection, query, where, orderBy, serverTimestamp, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const REQUESTS = 'verificationRequests';

export async function submitVerificationRequest(uid, { name, phone }, documentUrl, kycData = {}) {
  const front = kycData.frontDocumentUrl || documentUrl || '';
  const back = kycData.backDocumentUrl || '';
  const selfie = kycData.selfieUrl || '';
  const requestRef = doc(db, REQUESTS, uid);
  const existingSnap = await getDoc(requestRef);
  const existing = existingSnap.exists() ? existingSnap.data() : {};
  const providerApproved = existing.diditProvider === 'didit' && existing.diditVerified === true;

  if (providerApproved) {
    const saveDiditKycDetails = httpsCallable(functions, 'createDiditKycSession');
    await saveDiditKycDetails({ action: 'saveDetails', name: name || '', phone: phone || '', frontDocumentUrl: front, backDocumentUrl: back, selfieUrl: selfie, kycData });
    return;
  }

  await setDoc(requestRef, {
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
    liveFaceVerified: kycData.liveFaceVerified === true,
    liveFaceMethod: kycData.liveFaceMethod || '',
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
