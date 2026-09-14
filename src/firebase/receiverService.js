// Backs the Remittance wizard's "Select or Add Receiver" step. Saved
// receivers live under the signed-in customer's own doc so each user only
// ever sees their own list.
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './config';

function receiversRef(uid) { return collection(db, 'users', uid, 'receivers'); }

export async function getSavedReceivers(uid) {
  if (!uid) return [];
  const q = query(receiversRef(uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveReceiver(uid, receiver) {
  if (!uid) return null;
  const ref = await addDoc(receiversRef(uid), { ...receiver, createdAt: serverTimestamp() });
  return ref.id;
}

export async function maybeSaveReceiver(serviceData, uid) {
  if (serviceData.receiverMode === 'new' && serviceData.saveAsFavorite && uid) {
    await saveReceiver(uid, {
      firstName: serviceData.receiverFirstName,
      lastName: serviceData.receiverLastName,
      relationship: serviceData.receiverRelationship,
      phone: serviceData.receiverPhone,
      method: serviceData.method,
      country: serviceData.country,
      address: serviceData.receiverAddress || null,
      placeOfIssue: serviceData.receiverPlaceOfIssue || null,
      bankName: serviceData.receiverBankName || null,
      accountNumber: serviceData.receiverAccountNumber || null,
      branch: serviceData.receiverBranch || null,
      routingNumber: serviceData.receiverRoutingNumber || null,
      pickupNetwork: serviceData.receiverPickupNetwork || null,
      idType: serviceData.receiverIdType || null,
      idNumber: serviceData.receiverIdNumber || null,
      pickupCity: serviceData.receiverPickupCity || null,
      walletProvider: serviceData.receiverWalletProvider || null,
      walletNumber: serviceData.receiverWalletNumber || null,
    });
  }
}

export async function uploadPassport(uid, localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}.jpg`;
  const storageRef = ref(storage, `remittance-passports/${uid}/${fileName}`);
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}
