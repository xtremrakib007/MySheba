// Bill Payment billers for Malaysia and Bangladesh.
//
// These are the defaults the app ships with so Bill Payment works out of the
// box. Admin > Billers (the admin panel's `billers` collection) can add,
// rename or switch off entries without an app update - see
// src/firebase/billerService.js, which merges the two.
//
// `accountLabel` is what the customer is asked for, because every biller
// calls it something different - TNB has an account number, Titas Gas a
// customer code, a postpaid telco just wants the phone number.

export const BILLER_CATEGORIES = {
  electricity: { key: 'electricity', label: 'Electricity', icon: '💡' },
  water: { key: 'water', label: 'Water', icon: '💧' },
  gas: { key: 'gas', label: 'Gas', icon: '🔥' },
  sewerage: { key: 'sewerage', label: 'Sewerage', icon: '🚰' },
  telco: { key: 'telco', label: 'Postpaid Mobile', icon: '📱' },
  internet: { key: 'internet', label: 'Internet & TV', icon: '📶' },
};

export const CATEGORY_ORDER = ['electricity', 'water', 'gas', 'sewerage', 'internet', 'telco'];

export const DEFAULT_BILLERS = [
  // ---- Malaysia ----
  { id: 'my-tnb', country: 'MY', name: 'Tenaga Nasional (TNB)', category: 'electricity', accountLabel: 'TNB account number' },
  { id: 'my-sesb', country: 'MY', name: 'Sabah Electricity (SESB)', category: 'electricity', accountLabel: 'Account number' },
  { id: 'my-seb', country: 'MY', name: 'Sarawak Energy (SEB)', category: 'electricity', accountLabel: 'Account number' },
  { id: 'my-air-selangor', country: 'MY', name: 'Air Selangor', category: 'water', accountLabel: 'Account number' },
  { id: 'my-saj', country: 'MY', name: 'Ranhill SAJ (Johor)', category: 'water', accountLabel: 'Account number' },
  { id: 'my-pba', country: 'MY', name: 'PBA Pulau Pinang', category: 'water', accountLabel: 'Account number' },
  { id: 'my-iwk', country: 'MY', name: 'Indah Water Konsortium', category: 'sewerage', accountLabel: 'Account number' },
  { id: 'my-unifi', country: 'MY', name: 'TM / Unifi', category: 'internet', accountLabel: 'Unifi account number' },
  { id: 'my-astro', country: 'MY', name: 'Astro', category: 'internet', accountLabel: 'Astro account number' },
  { id: 'my-time', country: 'MY', name: 'TIME Internet', category: 'internet', accountLabel: 'Account number' },
  { id: 'my-maxis', country: 'MY', name: 'Maxis Postpaid', category: 'telco', accountLabel: 'Mobile number' },
  { id: 'my-celcom', country: 'MY', name: 'CelcomDigi Postpaid', category: 'telco', accountLabel: 'Mobile number' },
  { id: 'my-umobile', country: 'MY', name: 'U Mobile Postpaid', category: 'telco', accountLabel: 'Mobile number' },
  { id: 'my-yes', country: 'MY', name: 'Yes 5G Postpaid', category: 'telco', accountLabel: 'Mobile number' },

  // ---- Bangladesh ----
  { id: 'bd-desco', country: 'BD', name: 'DESCO', category: 'electricity', accountLabel: 'Account / consumer number' },
  { id: 'bd-dpdc', country: 'BD', name: 'DPDC', category: 'electricity', accountLabel: 'Account / consumer number' },
  { id: 'bd-nesco', country: 'BD', name: 'NESCO', category: 'electricity', accountLabel: 'Consumer number' },
  { id: 'bd-bpdb', country: 'BD', name: 'BPDB', category: 'electricity', accountLabel: 'Consumer number' },
  { id: 'bd-breb', country: 'BD', name: 'Palli Bidyut (BREB)', category: 'electricity', accountLabel: 'SMS account number' },
  { id: 'bd-wzpdcl', country: 'BD', name: 'WZPDCL', category: 'electricity', accountLabel: 'Consumer number' },
  { id: 'bd-titas', country: 'BD', name: 'Titas Gas', category: 'gas', accountLabel: 'Customer code' },
  { id: 'bd-jalalabad', country: 'BD', name: 'Jalalabad Gas', category: 'gas', accountLabel: 'Customer code' },
  { id: 'bd-bakhrabad', country: 'BD', name: 'Bakhrabad Gas', category: 'gas', accountLabel: 'Customer code' },
  { id: 'bd-dwasa', country: 'BD', name: 'Dhaka WASA', category: 'water', accountLabel: 'Bill / account number' },
  { id: 'bd-ctgwasa', country: 'BD', name: 'Chattogram WASA', category: 'water', accountLabel: 'Bill / account number' },
  { id: 'bd-gp', country: 'BD', name: 'Grameenphone Postpaid', category: 'telco', accountLabel: 'Mobile number' },
  { id: 'bd-robi', country: 'BD', name: 'Robi Postpaid', category: 'telco', accountLabel: 'Mobile number' },
  { id: 'bd-banglalink', country: 'BD', name: 'Banglalink Postpaid', category: 'telco', accountLabel: 'Mobile number' },
  { id: 'bd-teletalk', country: 'BD', name: 'Teletalk Postpaid', category: 'telco', accountLabel: 'Mobile number' },
];

/** Countries Bill Payment covers, in the order they are shown. */
export const BILL_COUNTRIES = [
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', curr: 'MYR' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', curr: 'BDT' },
];

export function billersForCountry(country, extra = []) {
  const all = [...DEFAULT_BILLERS, ...extra];
  return all.filter((b) => b.country === country && b.active !== false);
}

export function groupByCategory(billers) {
  const groups = [];
  CATEGORY_ORDER.forEach((key) => {
    const items = billers.filter((b) => b.category === key);
    if (items.length) groups.push({ ...BILLER_CATEGORIES[key], items });
  });
  const known = new Set(CATEGORY_ORDER);
  const rest = billers.filter((b) => !known.has(b.category));
  if (rest.length) groups.push({ key: 'other', label: 'Other', icon: '🧾', items: rest });
  return groups;
}

export function findBiller(id, extra = []) {
  return [...DEFAULT_BILLERS, ...extra].find((b) => b.id === id) || null;
}
