import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './config';

const safeSegment = (value) => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');

/** Support Chat media only. Legacy direct/group/room uploads are rejected. */
export async function uploadChatMedia(chatType, threadId, uri, opts = {}) {
  if (chatType !== 'support') throw new Error('Only Support Chat media uploads are supported.');
  if (!threadId || !uri) throw new Error('Missing Support Chat upload details.');
  const response = await fetch(uri);
  const blob = await response.blob();
  const mimeType = opts.mimeType || blob.type || 'application/octet-stream';
  const kind = opts.kind || 'file';
  const allowed = {
    image: ['image/'],
    video: ['video/'],
    voice: ['audio/'],
    document: ['application/pdf', 'text/plain', 'text/csv', 'application/zip', 'application/json', 'application/octet-stream'],
    file: ['image/', 'video/', 'audio/', 'application/pdf', 'text/', 'application/zip', 'application/json', 'application/octet-stream'],
  };
  const valid = (allowed[kind] || allowed.file).some((prefix) => mimeType.startsWith(prefix));
  if (!valid) throw new Error('Unsupported Support Chat attachment type.');
  const maxBytes = kind === 'voice' ? 15 * 1024 * 1024 : kind === 'image' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (blob.size > maxBytes) throw new Error('Attachment is too large.');
  const fallbackExt = { image: 'jpg', video: 'mp4', document: 'file', voice: 'm4a', file: 'bin' };
  const name = opts.name || `${kind}-${Date.now()}.${fallbackExt[kind] || 'bin'}`;
  const path = `chat-media/support/${safeSegment(threadId)}/${Date.now()}-${safeSegment(name)}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  return { url: await getDownloadURL(storageRef), name, size: blob.size || 0, mimeType };
}

async function uploadSimple(path, uri, mimeType) {
  const response = await fetch(uri); const blob = await response.blob();
  const type = mimeType || blob.type || 'image/jpeg';
  const storageRef = ref(storage, path(type));
  await uploadBytes(storageRef, blob, { contentType: type });
  return getDownloadURL(storageRef);
}
const imageUpload = (folder, id, uri, mimeType, index = '') => uploadSimple((type) => `${folder}/${id}/${Date.now()}${index !== '' ? `-${index}` : ''}.${type.includes('png') ? 'png' : 'jpg'}`, uri, mimeType);
export const uploadAvatar = (uid, uri, mimeType) => imageUpload('avatars', uid, uri, mimeType);
export const uploadBusinessLogo = (uid, uri, mimeType) => imageUpload('business-logos', uid, uri, mimeType);
export const uploadPaymentQr = (uri, mimeType) => imageUpload('payment-settings', 'duitnow-qr', uri, mimeType);
export const uploadRemittanceReceipt = (txId, uri, mimeType) => imageUpload('remittance-receipts', txId, uri, mimeType);
export const uploadOrderReceipt = (txId, uri, mimeType) => imageUpload('order-receipts', txId, uri, mimeType);
export const uploadVerificationDocument = (uid, uri, mimeType) => imageUpload('verification-documents', uid, uri, mimeType);

export async function uploadPassportCopy(uid, uri, mimeType) {
  const response = await fetch(uri); const blob = await response.blob();
  const type = mimeType || blob.type || 'application/octet-stream';
  const ext = type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : 'jpg';
  const storageRef = ref(storage, `passport-copies/${uid}/${Date.now()}.${ext}`);
  await uploadBytes(storageRef, blob, { contentType: type });
  return { url: await getDownloadURL(storageRef), isPdf: type.includes('pdf') };
}
export const uploadFlightTicket = (id, uri, mimeType) => imageUpload('flight-tickets', id, uri, mimeType);
