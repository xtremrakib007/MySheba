// Marketplace "Buy & Sell" module (Phase 1 of the Marketplace PRD) - a
// community classifieds board layered on top of the existing MySheba
// account system. Any signed-in account can list an item or browse/buy.
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { computeGeohash } from '../utils/geo';
import { logActivity, logError } from './logService';
import { fetchBusinessProfile } from './businessProfileService';

const LISTINGS = 'marketplaceListings';
const SAVES = 'marketplaceSaves';
const REPORTS = 'marketplaceReports';
export const CATEGORIES = ['Electronics', 'Mobile Phones', 'Computers', 'Vehicles', 'Furniture', 'Appliances', 'Clothing', 'Other'];
export const CONDITIONS = ['New', 'Like New', 'Good', 'Fair'];
export const REPORT_REASONS = ['Fake or scam', 'Prohibited item', 'Offensive content', 'Already sold / spam'];
const MAX_FEED = 200;

export async function createListing(seller, data) {
  const biz = await fetchBusinessProfile(seller.uid);
  const ref = await addDoc(collection(db, LISTINGS), {
    sellerId: seller.uid, sellerName: seller.name || '', sellerRole: seller.role || '',
    sellerVerified: !!seller.verified, sellerIsBusiness: !!biz?.isBusinessProfile,
    title: (data.title || '').trim(), category: data.category, description: (data.description || '').trim(),
    images: [], price: Number(data.price) || 0, negotiable: !!data.negotiable, condition: data.condition,
    location: (data.location || '').trim(), latitude: data.latitude ?? null, longitude: data.longitude ?? null,
    geohash: computeGeohash(data.latitude, data.longitude), status: 'active', reportCount: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}
export async function setListingImages(listingId, images) { await updateDoc(doc(db, LISTINGS, listingId), { images, updatedAt: serverTimestamp() }); }
export async function updateListing(listingId, patch) { await updateDoc(doc(db, LISTINGS, listingId), { ...patch, updatedAt: serverTimestamp() }); }
export async function setListingStatus(listingId, status) { await updateDoc(doc(db, LISTINGS, listingId), { status, updatedAt: serverTimestamp() }); }
export async function deleteListing(listingId) { await deleteDoc(doc(db, LISTINGS, listingId)); }
export async function getListing(listingId) { const snap = await getDoc(doc(db, LISTINGS, listingId)); return snap.exists() ? { id: snap.id, ...snap.data() } : null; }
export function subscribeListing(listingId, callback, onError) { return onSnapshot(doc(db, LISTINGS, listingId), (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError); }
export function subscribeActiveListings(callback, onError) { const q = query(collection(db, LISTINGS), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(MAX_FEED)); return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError); }
export function subscribeMyListings(uid, callback, onError) { const q = query(collection(db, LISTINGS), where('sellerId', '==', uid), orderBy('createdAt', 'desc')); return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError); }
function saveId(uid, listingId) { return `${uid}_${listingId}`; }
export async function saveListing(uid, listing) { await setDoc(doc(db, SAVES, saveId(uid, listing.id)), { uid, listingId: listing.id, title: listing.title || '', price: listing.price || 0, image: listing.images?.[0] || '', sellerId: listing.sellerId || '', createdAt: serverTimestamp() }); }
export async function unsaveListing(uid, listingId) { await deleteDoc(doc(db, SAVES, saveId(uid, listingId))); }
export async function isListingSaved(uid, listingId) { const snap = await getDoc(doc(db, SAVES, saveId(uid, listingId))); return snap.exists(); }
export function subscribeMySaved(uid, callback, onError) { const q = query(collection(db, SAVES), where('uid', '==', uid), orderBy('createdAt', 'desc')); return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError); }
export async function reportListing(listingId, listingTitle, reporterId, reason, note) { await addDoc(collection(db, REPORTS), { listingId, listingTitle: listingTitle || '', reporterId, reason, note: (note || '').trim(), createdAt: serverTimestamp() }); }
export function isFeatured(listing) { if (!listing?.featured || !listing?.featuredUntil) return false; const untilMs = listing.featuredUntil.seconds ? listing.featuredUntil.seconds * 1000 : listing.featuredUntil; return untilMs > Date.now(); }
function createRequestId(prefix) { return `ms_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,14)}`; }
export async function boostListing(listingId, requestId = createRequestId('boost')) {
  const fn = httpsCallable(functions, 'boostListing');
  try { const { data } = await fn({ listingId, requestId }); logActivity('listing_boosted', { listingId }); return data; }
  catch (err) { logError('marketplaceService.boostListing', err); throw new Error(err.message || 'Could not boost this listing right now.'); }
}
