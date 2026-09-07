// Backs the Remittance wizard's "Select or Add Receiver" step. Saved
// receivers live under the signed-in customer's own doc so each user only
// ever sees their own list (no cross-user query needed).
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './config';

function receiversRef(uid) {
  return collection(db, 'users', uid, 'receivers');
}

/** Returns this user's saved receivers, most recently added first. */
export async function getSavedReceivers(uid) {
  if (!uid) return [];
  const q = query(receiversRef(uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Saves a new receiver ({ firstName, lastName, phone }) as a favorite. */
export async function saveReceiver(uid, receiver) {
  if (!uid) return null;
  const ref = await addDoc(receiversRef(uid), { ...receiver, createdAt: serverTimestamp() });
  return ref.id;
}

/** Called after a successful remittance submission: persists the receiver
 * entered on the "Add New Receiver" step if the user checked "Save as Favorite".
 * Includes the method-specific fields (bank deposit / cash pickup / eWallet)
 * so a saved receiver can be reused as a complete record next time, not just
 * name + phone. */
export async function maybeSaveReceiver(serviceData, uid) {
  if (serviceData.receiverMode === 'new' && serviceData.saveAsFavorite && uid) {
    await saveReceiver(uid, {
      firstName: serviceData.receiverFirstName,
      lastName: serviceData.receiverLastName,
      relationship: serviceData.receiverRelationship,
      phone: serviceData.receiverPhone,
      method: serviceData.method,
      country: serviceData.country,
      // Bank deposit
      bankName: serviceData.receiverBankName || null,
      accountNumber: serviceData.receiverAccountNumber || null,
      branch: serviceData.receiverBranch || null,
      routingNumber: serviceData.receiverRoutingNumber || null,
      // Cash pickup
      pickupNetwork: serviceData.receiverPickupNetwork || null,
      idType: serviceData.receiverIdType || null,
      idNumber: serviceData.receiverIdNumber || null,
      pickupCity: serviceData.receiverPickupCity || null,
      // eWallet
      walletProvider: serviceData.receiverWalletProvider || null,
      walletNumber: serviceData.receiverWalletNumber || null,
    });
  }
}

/** Uploads the sender's passport photo (captured or picked on the
 * Remittance wizard's Sender Details step) to Storage, returns its
 * download URL. Same shape as topupService.uploadReceipt. */
export async function uploadPassport(uid, localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}.jpg`;
  const storageRef = ref(storage, `remittance-passports/${uid}/${fileName}`);
  // Same fix as topupService.uploadReceipt - without an explicit contentType,
  // Expo's fetch(localUri).blob() often loses the image mime type, which
  // fails the storage.rules image/.* check and blocks the upload.
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}
