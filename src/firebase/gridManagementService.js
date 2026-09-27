import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const DOC = doc(db, 'settings', 'gridManagement');

export const GRID_DEFS = [
  ['recharge','Recharge'],['rechargePin','Recharge PIN'],['mobilebanking','Mobile Banking'],['internet','Internet'],['billpayment','Bill Payment'],
  ['remittance','Remittance'],['bus','Bus'],['train','Train'],['flight','Flight'],['entertainment','Entertainment'],
  ['topup','Top-Up'],['history','Transactions'],['support','Support'],['myAccount','My Account'],['profile','Profile'],
  ['dealerFeatures','Dealer Features'],['resellerFeatures','Reseller Features'],['adminFeatures','Admin Features'],
  ['moreFeaturesTile','More Services'],['walletTransfer','Wallet Transfer'],['myDocuments','My Documents'],
  // 'My Business' is gone: the tile was removed when its screen turned out
  // not to exist, so a toggle for it controlled nothing.
  ['salary','Salary & OT'],['kyc','Profile & KYC'],
  ['fomema','FOMEMA'],['visa','Visa Malaysia'],['mydigital','Malaysia Arrival Card'],['passport','Passport'],
  ['adminAnalytics','Analytics'],['inquiries','Inquiries'],['pending','Pending'],['topups','Top-Ups'],
  ['rates','Rates'],['pricing','Pricing'],['payments','Payments'],['transferPoints','Transfers'],['apiManagement','API Management'],
  ['userManagement','Users'],['verificationManagement','KYC Verification'],['featureAccess','Feature Access'],['banners','Banners'],['announcements','Announcements']
].map(([key,name]) => ({ key, name }));

export const DEFAULT_GRID_MANAGEMENT = Object.fromEntries(GRID_DEFS.map(({key}) => [key, key === 'rechargePin' ? false : true]));

function merge(data) {
  const out = { ...DEFAULT_GRID_MANAGEMENT };
  GRID_DEFS.forEach(({key}) => { if (data && typeof data[key] === 'boolean') out[key] = data[key]; });
  return out;
}

export function subscribeGridManagement(callback, onError) {
  return onSnapshot(DOC, snap => callback(snap.exists() ? merge(snap.data()) : { ...DEFAULT_GRID_MANAGEMENT }), onError);
}

export async function ensureGridManagement() {
  const snap = await getDoc(DOC);
  return snap.exists() ? merge(snap.data()) : { ...DEFAULT_GRID_MANAGEMENT };
}

export async function setGridActive(key, active) {
  if (!GRID_DEFS.some(g => g.key === key)) throw new Error('Unknown grid.');
  await setDoc(DOC, { [key]: Boolean(active), updatedAt: serverTimestamp() }, { merge: true });
}

export function isGridActive(gridManagement, key) {
  return gridManagement?.[key] !== false;
}
