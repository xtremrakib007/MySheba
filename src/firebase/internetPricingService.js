// Internet data package prices start out hardcoded in src/data/countries.js
// (internetPackagesByOperator) - real defaults so the app works out of the
// box. Admin > Pricing can now fully manage that list per operator without
// a code change:
//   - edit any field (name/data/validity/price) of a built-in package
//   - remove a built-in package from the list a customer sees
//   - add brand new packages
//   - edit/remove the packages it added
//
// One doc per operator (doc id = operator name, e.g. "Grameenphone"):
//   {
//     prices:     { [packageName]: price }        // legacy, price-only overrides
//     overrides:  { [baseIndex]: { name, data, valid, price } }  // full-field
//                                                   // edits, keyed by the
//                                                   // package's index in
//                                                   // internetPackagesByOperator
//                                                   // (stable even if the
//                                                   // name is edited)
//     removedBase:{ [baseIndex]: true }            // built-in packages hidden
//     custom:     { [id]: { name, data, valid, price } } // admin-added packages
//   }
// getMergedPackages() (src/utils/internetPackages.js) combines all of this
// with the hardcoded base list at the point of use, so both the Admin
// pricing tab and the customer-facing InternetSteps stay in sync.
import { collection, doc, setDoc, deleteField, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { randomUUID } from 'expo-crypto';
import { db } from './config';

const COLLECTION = 'internetPricing';

function newCustomId() {
  return `c${randomUUID()}`;
}

function cleanPackageFields({ name, data, valid, price }) {
  const num = Number(price);
  if (!name || !String(name).trim()) throw new Error('Enter a package name.');
  if (!data || !String(data).trim()) throw new Error('Enter the data amount.');
  if (!valid || !String(valid).trim()) throw new Error('Enter the validity period.');
  if (!Number.isFinite(num) || num < 0) throw new Error('Enter a valid price.');
  return { name: String(name).trim(), data: String(data).trim(), valid: String(valid).trim(), price: num };
}

/** Live map of every operator's pricing doc: { [operator]: { prices, overrides, removedBase, custom } }. */
export function subscribeInternetPricing(callback, onError) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() || {};
      });
      callback(map);
    },
    onError
  );
}

// ---- Success TopUp API packages ----
//
// Bangladesh packages come live from /api/drives, so there is no base list to
// override by index. They are keyed by the provider's own package id under
// `apiPackages`, in the same per-operator doc:
//
//   apiPackages: { [packageId]: { price?: number, hidden?: true } }
//
// `price` is the SELL price in BDT - what the customer pays. The catalogue
// price stays the cost and is what gets sent to Success TopUp, so a markup here
// is margin, not a changed order. No entry means sell at cost, which is the
// behaviour before this existed. The server resolves all of this
// (functions/successTopUpCatalog.js); these writes only record the intent.

/** Sets the customer-facing BDT price for one API package. */
export async function setApiPackagePrice(operator, packageId, price) {
  if (!operator || !packageId) throw new Error('Missing operator or package.');
  const num = Number(price);
  if (!Number.isFinite(num) || num <= 0) throw new Error('Enter a valid price.');
  await setDoc(
    doc(db, COLLECTION, operator),
    { [`apiPackages.${packageId}.price`]: Math.round(num * 100) / 100, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Clears the override so the package sells at the provider's catalogue price. */
export async function clearApiPackagePrice(operator, packageId) {
  if (!operator || !packageId) throw new Error('Missing operator or package.');
  await setDoc(
    doc(db, COLLECTION, operator),
    { apiPackages: { [packageId]: { price: deleteField() } }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Hides or un-hides an API package from customers. */
export async function setApiPackageHidden(operator, packageId, hidden) {
  if (!operator || !packageId) throw new Error('Missing operator or package.');
  await setDoc(
    doc(db, COLLECTION, operator),
    { apiPackages: { [packageId]: { hidden: hidden ? true : deleteField() } }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Overrides a single package's price for one operator (creates the doc if needed). Kept for backward compatibility. */
export async function setPackagePrice(operator, packageName, price) {
  if (!operator || !packageName) throw new Error('Missing operator or package.');
  const num = Number(price);
  if (!Number.isFinite(num) || num < 0) throw new Error('Enter a valid price.');
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { [`prices.${packageName}`]: num, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Edits any field(s) of a built-in package. `baseIndex` is its position in internetPackagesByOperator[operator]. */
export async function updateBasePackage(operator, baseIndex, fields) {
  if (!operator || baseIndex == null) throw new Error('Missing operator or package.');
  const clean = cleanPackageFields(fields);
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { [`overrides.${baseIndex}`]: clean, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Hides a built-in package from the list shown in the app (does not touch the code default). */
export async function removeBasePackage(operator, baseIndex) {
  if (!operator || baseIndex == null) throw new Error('Missing operator or package.');
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { [`removedBase.${baseIndex}`]: true, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Un-hides a previously removed built-in package. */
export async function restoreBasePackage(operator, baseIndex) {
  if (!operator || baseIndex == null) throw new Error('Missing operator or package.');
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { removedBase: { [baseIndex]: deleteField() }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Adds a brand new package for an operator. Returns the new package's id. */
export async function addCustomPackage(operator, fields) {
  if (!operator) throw new Error('Missing operator.');
  const clean = cleanPackageFields(fields);
  const id = newCustomId();
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { [`custom.${id}`]: clean, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return id;
}

/** Edits a package the admin previously added. */
export async function updateCustomPackage(operator, id, fields) {
  if (!operator || !id) throw new Error('Missing operator or package.');
  const clean = cleanPackageFields(fields);
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { [`custom.${id}`]: clean, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Removes a package the admin previously added. */
export async function removeCustomPackage(operator, id) {
  if (!operator || !id) throw new Error('Missing operator or package.');
  const ref = doc(db, COLLECTION, operator);
  await setDoc(
    ref,
    { custom: { [id]: deleteField() }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
