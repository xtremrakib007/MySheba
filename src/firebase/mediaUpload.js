// Shared upload helper used by Support chat, direct chat, group chat, and
// room chat when someone attaches a photo, video, document, or records a
// voice note. Every file goes to Storage under
// `chat-media/{chatType}/{threadId}/...` (see storage.rules) and we hand
// back the info the message doc needs (url, name, size, mimeType).
//
// chatType is part of the path (not just metadata) because storage.rules
// needs it to know which Firestore collection governs read/write access -
// chats/{uid} for 'support', directChats/{id} for 'direct', groupChats/{id}
// for 'group', roomChats/{id} for 'room'. Splitting the path this way is
// what lets each match block in storage.rules check real thread membership
// instead of only requiring "signed in" for every chat's media.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './config';

/**
 * Uploads a local file (picked via expo-image-picker / expo-document-picker,
 * or recorded via expo-av) to
 * `chat-media/{chatType}/{threadId}/{timestamp}-{name}`.
 *
 * @param {string} chatType - 'support' | 'direct' | 'group' | 'room' -
 *   which thread type this upload belongs to. See storage.rules for how
 *   each one is scoped.
 * @param {string} threadId - the 1:1 chat id (customer uid for 'support'),
 *   direct chat id, group id, or room id.
 * @param {string} uri - local file uri from the picker/recorder.
 * @param {object} opts - { name, mimeType, kind } where kind is
 *   'image' | 'video' | 'document' | 'voice' (only used to pick a fallback
 *   extension/name when the picker doesn't give us one).
 * @returns {Promise<{url:string, name:string, size:number, mimeType:string}>}
 */
export async function uploadChatMedia(chatType, threadId, uri, opts = {}) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const fallbackExt = { image: 'jpg', video: 'mp4', document: 'file', voice: 'm4a' };
  const safeName =
    opts.name ||
    `${opts.kind || 'file'}-${Date.now()}.${fallbackExt[opts.kind] || 'bin'}`;

  const path = `chat-media/${chatType}/${threadId}/${Date.now()}-${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: opts.mimeType || blob.type || 'application/octet-stream',
  });
  const url = await getDownloadURL(storageRef);

  return {
    url,
    name: safeName,
    size: blob.size || opts.size || 0,
    mimeType: opts.mimeType || blob.type || '',
  };
}

/**
 * Uploads a picked profile photo to `avatars/{uid}/{timestamp}.jpg` (see
 * storage.rules - only the owner can write into their own folder) and
 * returns the public download URL to save on the user's profile doc.
 *
 * @param {string} uid - the signed-in user's uid.
 * @param {string} uri - local file uri from expo-image-picker.
 * @param {string} mimeType - e.g. 'image/jpeg'.
 * @returns {Promise<string>} download URL.
 */
export async function uploadAvatar(uid, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `avatars/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads a picked Business Profile logo to `business-logos/{uid}/{timestamp}.jpg`
 * (see storage.rules - only the owner can write into their own folder) and
 * returns the download URL to save on the businessProfiles/{uid} doc's
 * `businessLogoUrl` field. Same shape as uploadAvatar above.
 *
 * @param {string} uid - the signed-in user's uid.
 * @param {string} uri - local file uri from expo-image-picker.
 * @param {string} mimeType - e.g. 'image/jpeg'.
 * @returns {Promise<string>} download URL.
 */
export async function uploadBusinessLogo(uid, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `business-logos/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads the DuitNow QR code image a superadmin sets from Admin >
 * Payments, to `payment-settings/duitnow-qr-{timestamp}.jpg` (see
 * storage.rules - superadmin-only write, mirrors banner-images' shape).
 * Returns the download URL to save on settings/paymentMethods'
 * `duitnowQrUrl` field via paymentSettingsService.updatePaymentSettings.
 */
export async function uploadPaymentQr(uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `payment-settings/duitnow-qr-${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads the dealer/admin's proof-of-transfer photo when marking a
 * Remittance order complete, to `remittance-receipts/{txId}/{timestamp}.jpg`
 * (see storage.rules - staff-only write, mirrors banner-images). Returns
 * the download URL to save on the transaction doc's `receiptUrl` field.
 */
export async function uploadRemittanceReceipt(txId, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `remittance-receipts/${txId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}


/** Generic Phase 10 receipt upload used by all dealer-queue services. */
export async function uploadOrderReceipt(txId, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `order-receipts/${txId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads one photo for a marketplace listing to
 * `marketplace-images/{listingId}/{timestamp}-{index}.jpg` (see
 * storage.rules - only that listing's seller can write into its folder,
 * and the listing doc must already exist, so call this AFTER
 * marketplaceService.createListing has returned an id). Returns the
 * download URL to add to the listing's `images[]` array.
 */
export async function uploadMarketplaceImage(listingId, uri, mimeType, index) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `marketplace-images/${listingId}/${Date.now()}-${index || 0}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads one photo for an Accommodation property listing (Phase 2 of the
 * Marketplace PRD) to `accommodation-images/{propertyId}/{timestamp}-{index}.{ext}`
 * (see storage.rules - owner-only write). Mirrors uploadMarketplaceImage
 * above. Returns the download URL to append to the property's `images[]`.
 */
export async function uploadPropertyImage(propertyId, uri, mimeType, index) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `accommodation-images/${propertyId}/${Date.now()}-${index || 0}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads the one profile photo for a Local Services provider listing
 * (Phase 2 of the Marketplace PRD, section 8) to
 * `service-provider-images/{providerId}/{timestamp}.{ext}` (see
 * storage.rules - owner-only write). Mirrors uploadPropertyImage above,
 * minus the index suffix since a provider has a single photo rather than
 * a gallery. Returns the download URL to set on the provider's `photo`
 * field via serviceProviderService.setProviderPhoto.
 */
export async function uploadServiceProviderPhoto(providerId, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `service-provider-images/${providerId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads one photo for a Community post (job/event/lost&found/emergency/
 * news - see communityService.js) to
 * `community-images/{postId}/{timestamp}-{index}.{ext}` (see
 * storage.rules - only that post's author can write into its folder).
 * Mirrors uploadMarketplaceImage above. Returns the download URL to
 * append to the post's `images[]`.
 */
export async function uploadCommunityImage(postId, uri, mimeType, index) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `community-images/${postId}/${Date.now()}-${index || 0}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads one photo for a Social Feed post (Next Update PRD §3 - see
 * socialFeedService.js) to
 * `social-images/{postId}/{timestamp}-{index}.{ext}` (see storage.rules -
 * only that post's author can write into its folder). Mirrors
 * uploadCommunityImage above. Returns the download URL to append to the
 * post's `images[]`.
 */
export async function uploadSocialPostImage(postId, uri, mimeType, index) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `social-images/${postId}/${Date.now()}-${index || 0}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads a picked ID/identity document photo for the "Verified" seller
 * badge (Phase 3 of the Marketplace PRD, section 12) to
 * `verification-documents/{uid}/{timestamp}.{ext}` (see storage.rules -
 * mirrors remittance-passports: owner-write, owner-or-staff read, since
 * an ID document is as sensitive as a passport photo). Returns the
 * download URL to submit via verificationService.submitVerificationRequest.
 */
export async function uploadVerificationDocument(uid, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `verification-documents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'image/jpeg',
  });
  return getDownloadURL(storageRef);
}

/**
 * Uploads the passport copy a user attaches on their own Profile screen
 * (First Name/Last Name/.../Upload passport copy section) to
 * `passport-copies/{uid}/{timestamp}.{ext}` (see storage.rules - owner-write,
 * owner-or-superadmin-only read, stricter than remittance-passports since
 * this one isn't needed by dealer/admin support flows). Accepts either an
 * image or a PDF, unlike uploadAvatar/uploadVerificationDocument which are
 * image-only. Returns the download URL to save on the user's
 * `passportCopyUrl` field via authService.updateUserFields.
 */
export async function uploadPassportCopy(uid, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const type = mimeType || blob.type || '';
  const isPdf = type.includes('pdf');
  const ext = isPdf ? 'pdf' : type.includes('png') ? 'png' : 'jpg';
  const path = `passport-copies/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: type || 'application/octet-stream',
  });
  const url = await getDownloadURL(storageRef);
  return { url, isPdf };
}

/**
 * Uploads the ticket/receipt attached by a staff member responding to a
 * flight inquiry, to `flight-tickets/{inquiryId}/{timestamp}.{ext}` (see
 * storage.rules - staff-only write). Returns the download URL to save on
 * the inquiry doc's `ticketUrl` field.
 */
export async function uploadFlightTicket(inquiryId, uri, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();

  const isPdf = (mimeType || blob.type || '').includes('pdf');
  const ext = isPdf ? 'pdf' : (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `flight-tickets/${inquiryId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: mimeType || blob.type || 'application/octet-stream',
  });
  return getDownloadURL(storageRef);
}
