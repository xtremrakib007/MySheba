// Behaviour tests for firestore.rules.
//
// Rules that compile can still be wrong, and a wrong rule either leaks data or
// locks out real users - both silent until someone complains. This exercises
// the cases that matter against a real rules engine.
//
//   npx firebase emulators:start --only firestore    (in another terminal)
//   npm run test:rules
//
// The seeded profiles deliberately match what the Cloud Functions really
// write: a self-registered customer (functions/customerRegistration.js) has
// none of the suspended/inactive/disabled/mergedInto flags, which is exactly
// the case that used to deny every such account.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});

// Seed the profiles the rules read, plus some data.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users/customer1'), { role: 'customer', name: 'Cust One' }); // as customerRegistration writes it
  await setDoc(doc(db, 'users/suspended1'), { role: 'customer', name: 'Susp', suspended: true });
  await setDoc(doc(db, 'users/customer2'), { role: 'customer', name: 'Cust Two' });
  await setDoc(doc(db, 'users/admin1'), { role: 'admin', name: 'Admin' });
  await setDoc(doc(db, 'users/super1'), { role: 'superadmin', name: 'Super' });
  await setDoc(doc(db, 'notes/n1'), { userId: 'customer1', text: 'mine' });
  await setDoc(doc(db, 'myDocuments/d1'), { userId: 'customer1', title: 'passport' });
  await setDoc(doc(db, 'rechargePins/p1'), { pin: '1234', status: 'available' });
  await setDoc(doc(db, 'contactMessages/m1'), { name: 'X', status: 'new' });
  await setDoc(doc(db, 'settings/pricing'), { notepadCost: 1 });
  await setDoc(doc(db, 'settings/paymentMethods'), { jompayBillerId: '1' });
  await setDoc(doc(db, 'billers/b1'), { name: 'TNB', country: 'MY', active: true });
  await setDoc(doc(db, 'banners/b1'), { title: 'Promo', active: true });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const results = [];
const check = async (label, expect, op) => {
  try {
    await (expect === 'allow' ? assertSucceeds(op()) : assertFails(op()));
    results.push(['PASS', label]);
  } catch (e) {
    results.push(['FAIL', label + ' — ' + String(e).split('\n')[0].slice(0, 90)]);
  }
};

// Private per-user vaults
await check('customer reads own note', 'allow', () => getDoc(doc(as('customer1'), 'notes/n1')));
await check("customer CANNOT read another's note", 'deny', () => getDoc(doc(as('customer2'), 'notes/n1')));
await check('customer creates own note', 'allow', () => setDoc(doc(as('customer1'), 'notes/n2'), { userId: 'customer1', text: 'x' }));
await check('customer CANNOT create note as someone else', 'deny', () => setDoc(doc(as('customer2'), 'notes/n3'), { userId: 'customer1', text: 'x' }));
await check('customer reads own document', 'allow', () => getDoc(doc(as('customer1'), 'myDocuments/d1')));
await check("customer CANNOT read another's document", 'deny', () => getDoc(doc(as('customer2'), 'myDocuments/d1')));

// PIN pool is server-only
await check('superadmin CANNOT read recharge PINs', 'deny', () => getDoc(doc(as('super1'), 'rechargePins/p1')));
await check('admin CANNOT write recharge PINs', 'deny', () => setDoc(doc(as('admin1'), 'rechargePins/p2'), { pin: '9' }));

// Contact messages
await check('admin reads contact messages', 'allow', () => getDoc(doc(as('admin1'), 'contactMessages/m1')));
await check('customer CANNOT read contact messages', 'deny', () => getDoc(doc(as('customer1'), 'contactMessages/m1')));
await check('admin sets contact status', 'allow', () => updateDoc(doc(as('admin1'), 'contactMessages/m1'), { status: 'read', handledBy: 'admin1', handledAt: new Date() }));

// Settings: everyone reads, admin writes, paymentMethods superadmin-only
await check('customer reads pricing', 'allow', () => getDoc(doc(as('customer1'), 'settings/pricing')));
await check('admin writes pricing', 'allow', () => setDoc(doc(as('admin1'), 'settings/pricing'), { notepadCost: 2 }, { merge: true }));
await check('customer CANNOT write pricing', 'deny', () => setDoc(doc(as('customer1'), 'settings/pricing'), { notepadCost: 3 }, { merge: true }));
await check('admin CANNOT write paymentMethods', 'deny', () => setDoc(doc(as('admin1'), 'settings/paymentMethods'), { jompayBillerId: '2' }, { merge: true }));
await check('superadmin writes paymentMethods', 'allow', () => setDoc(doc(as('super1'), 'settings/paymentMethods'), { jompayBillerId: '3' }, { merge: true }));

// Billers and banners
await check('customer reads billers', 'allow', () => getDocs(query(collection(as('customer1'), 'billers'))));
await check('admin edits billers', 'allow', () => setDoc(doc(as('admin1'), 'billers/b2'), { name: 'DESCO', country: 'BD' }));
await check('customer CANNOT edit billers', 'deny', () => setDoc(doc(as('customer1'), 'billers/b3'), { name: 'X' }));
await check('customer reads banners', 'allow', () => getDocs(query(collection(as('customer1'), 'banners'))));

// Queries the app actually issues
await check('customer lists own notes by userId', 'allow', () => getDocs(query(collection(as('customer1'), 'notes'), where('userId', '==', 'customer1'))));
await check('customer CANNOT list all notes', 'deny', () => getDocs(query(collection(as('customer1'), 'notes'))));

await check('suspended customer is blocked', 'deny', () => getDoc(doc(as('suspended1'), 'settings/pricing')));
await check('signed-in user with no profile is blocked', 'deny', () => getDoc(doc(as('ghost'), 'settings/pricing')));

for (const [status, label] of results) console.log(`${status}  ${label}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} rule behaviours correct`);
await env.cleanup();
process.exit(failed ? 1 : 0);
