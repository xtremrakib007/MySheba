// Generic CRUD over flat "config" collections — Rates & Pricing, Salary
// Settings, Banners, Categories, Module Subscriptions, Payment Settings.
//
// These six screens share the same shape (a list of small records with a
// handful of fields, optionally an `active` toggle and an `order` for
// sorting) so rather than write six bespoke services, this is one
// generic layer that each page's field config drives. Collection names
// (`rates`, `salaryTiers`, `banners`, `categories`, `moduleSubscriptions`,
// `paymentMethods`) are inferred — same caveat as earlier phases.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export type FieldType = 'text' | 'number' | 'boolean' | 'select';

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[]; // for 'select'
  placeholder?: string;
}

export interface ConfigRecord {
  id: string;
  [key: string]: unknown;
}

export async function fetchConfigRecords(
  collectionName: string,
  sortField = 'order'
): Promise<ConfigRecord[]> {
  const ref = collection(db, collectionName);
  let snap;
  try {
    snap = await getDocs(query(ref, orderBy(sortField)));
  } catch {
    // sortField may not exist on every doc / collection — fall back to
    // an unordered read rather than failing the whole page.
    snap = await getDocs(ref);
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createConfigRecord(
  collectionName: string,
  values: DocumentData
): Promise<void> {
  await addDoc(collection(db, collectionName), { ...values, createdAt: serverTimestamp() });
}

export async function updateConfigRecord(
  collectionName: string,
  id: string,
  values: DocumentData
): Promise<void> {
  await updateDoc(doc(db, collectionName, id), { ...values, updatedAt: serverTimestamp() });
}

export async function deleteConfigRecord(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}
