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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
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
  await setDoc(doc(db, 'users/support1'), { role: 'support', name: 'Support Agent' });
  await setDoc(doc(db, 'users/finance1'), { role: 'finance', name: 'Finance' });
  await setDoc(doc(db, 'users/admin2'), { role: 'admin', name: 'Admin granted orders+finance' });
  await setDoc(doc(db, 'accessOverrides/admin2'), { grant: ['orders', 'finance'], revoke: [] });
  await setDoc(doc(db, 'users/admin3'), { role: 'admin', name: 'Admin without users' });
  await setDoc(doc(db, 'accessOverrides/admin3'), { grant: [], revoke: ['users'] });
  await setDoc(doc(db, 'users/finance2'), { role: 'finance', name: 'Finance revoked' });
  await setDoc(doc(db, 'accessOverrides/finance2'), { grant: [], revoke: ['finance'] });
  await setDoc(doc(db, 'accessOverrides/super1'), { grant: [], revoke: ['support', 'orders', 'finance', 'users', 'settings', 'reports'] });
  await setDoc(doc(db, 'notes/n1'), { userId: 'customer1', text: 'mine' });
  await setDoc(doc(db, 'myDocuments/d1'), { userId: 'customer1', title: 'passport' });
  await setDoc(doc(db, 'rechargePins/p1'), { pin: '1234', status: 'available' });
  await setDoc(doc(db, 'contactMessages/m1'), { name: 'X', status: 'new' });
  await setDoc(doc(db, 'settings/pricing'), { notepadCost: 1 });
  await setDoc(doc(db, 'settings/paymentMethods'), { jompayBillerId: '1' });
  await setDoc(doc(db, 'billers/b1'), { name: 'TNB', country: 'MY', active: true });
  await setDoc(doc(db, 'banners/b1'), { title: 'Promo', active: true });
  await setDoc(doc(db, 'supportTickets/t1'), { userId: 'customer1', subject: 'Help', status: 'open' });
  await setDoc(doc(db, 'inquiries/i1'), { customerId: 'customer1', type: 'flight', status: 'new' });
  await setDoc(doc(db, 'announcements/a1'), { title: 'Notice' });
  await setDoc(doc(db, 'transactions/tx1'), { customerId: 'customer1', service: 'Recharge', status: 'pending', total: 50 });
  await setDoc(doc(db, 'transactions/tx2'), { customerId: 'customer1', service: 'Recharge', status: 'pending', total: 20 });
  await setDoc(doc(db, 'transactions/tx3'), { customerId: 'customer1', service: 'Recharge', status: 'pending', total: 30 });
  await setDoc(doc(db, 'topups/tp1'), { userId: 'customer1', points: 100, status: 'pending' });
  await setDoc(doc(db, 'pointTopUps/pt1'), { targetUid: 'customer1', amount: 10 });
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

// ---- support agent: support queues only ----
await check('support reads support tickets', 'allow', () => getDoc(doc(as('support1'), 'supportTickets/t1')));
await check('support moves a ticket along', 'allow', () => updateDoc(doc(as('support1'), 'supportTickets/t1'), { status: 'in_progress', adminNote: 'looking', updatedAt: new Date() }));
await check('support reads contact messages', 'allow', () => getDoc(doc(as('support1'), 'contactMessages/m1')));
await check('support reads inquiries', 'allow', () => getDoc(doc(as('support1'), 'inquiries/i1')));
await check('support updates inquiry status', 'allow', () => updateDoc(doc(as('support1'), 'inquiries/i1'), { status: 'contacted', updatedAt: new Date() }));
await check('support reads announcements', 'allow', () => getDoc(doc(as('support1'), 'announcements/a1')));
await check('support CANNOT read user records', 'deny', () => getDoc(doc(as('support1'), 'users/customer2')));
await check('support CANNOT read transactions', 'deny', () => getDoc(doc(as('support1'), 'transactions/tx1')));
await check('support CANNOT read top-ups', 'deny', () => getDoc(doc(as('support1'), 'topups/tp1')));
await check('support CANNOT write pricing', 'deny', () => setDoc(doc(as('support1'), 'settings/pricing'), { notepadCost: 9 }, { merge: true }));

// ---- finance: money screens, no user administration ----
await check('finance reads transactions', 'allow', () => getDoc(doc(as('finance1'), 'transactions/tx1')));
await check('finance CANNOT approve an order', 'deny', () => updateDoc(doc(as('finance1'), 'transactions/tx1'), { approved: true, approvedBy: 'finance1', approvedByRole: 'finance', approvedAt: new Date(), updatedAt: new Date() }));
await check('default admin CANNOT approve an order', 'deny', () => updateDoc(doc(as('admin1'), 'transactions/tx2'), { approved: true, approvedBy: 'admin1', approvedByName: 'Admin', approvedByRole: 'admin', approvedAt: new Date(), updatedAt: new Date() }));
await check('finance reads top-ups', 'allow', () => getDoc(doc(as('finance1'), 'topups/tp1')));
await check('finance reads point top-up history', 'allow', () => getDoc(doc(as('finance1'), 'pointTopUps/pt1')));
await check('finance looks up a user for top-up', 'allow', () => getDoc(doc(as('finance1'), 'users/customer1')));
await check('finance CANNOT change a user role', 'deny', () => updateDoc(doc(as('finance1'), 'users/customer1'), { role: 'admin' }));
await check('finance CANNOT change feature access', 'deny', () => updateDoc(doc(as('finance1'), 'users/customer1'), { features: { recharge: false } }));
await check('finance CANNOT write pricing', 'deny', () => setDoc(doc(as('finance1'), 'settings/pricing'), { notepadCost: 9 }, { merge: true }));
await check('finance CANNOT read recharge PINs', 'deny', () => getDoc(doc(as('finance1'), 'rechargePins/p1')));
await check('finance CANNOT read contact messages', 'deny', () => getDoc(doc(as('finance1'), 'contactMessages/m1')));

// ---- role defaults (built in, per the role sheet) ----
await check('default admin manages users', 'allow', () => getDoc(doc(as('admin1'), 'users/customer1')));
await check('default admin reviews KYC', 'allow', () => getDoc(doc(as('admin1'), 'verificationRequests/customer1')).catch((e) => { if (String(e).includes('not-found')) return; throw e; }));
await check('default admin CANNOT read transactions', 'deny', () => getDoc(doc(as('admin1'), 'transactions/tx1')));
await check('default admin CANNOT read top-ups', 'deny', () => getDoc(doc(as('admin1'), 'topups/tp1')));
await check('default admin CANNOT read point top-ups', 'deny', () => getDoc(doc(as('admin1'), 'pointTopUps/pt1')));

// ---- per-user overrides ----
await check('admin granted orders approves an order', 'allow', () => updateDoc(doc(as('admin2'), 'transactions/tx3'), { approved: true, approvedBy: 'admin2', approvedByName: 'A2', approvedByRole: 'admin', approvedAt: new Date(), updatedAt: new Date() }));
await check('admin granted finance reads top-ups', 'allow', () => getDoc(doc(as('admin2'), 'topups/tp1')));
await check('approval must name the approver\'s real role', 'deny', () => updateDoc(doc(as('admin2'), 'transactions/tx2'), { approved: true, approvedBy: 'admin2', approvedByName: 'A2', approvedByRole: 'superadmin', approvedAt: new Date(), updatedAt: new Date() }));
await check('admin with users revoked CANNOT read users', 'deny', () => getDoc(doc(as('admin3'), 'users/customer1')));
await check('admin with users revoked still edits settings', 'allow', () => setDoc(doc(as('admin3'), 'settings/pricing'), { notepadCost: 4 }, { merge: true }));
await check('finance with finance revoked CANNOT read transactions', 'deny', () => getDoc(doc(as('finance2'), 'transactions/tx1')));
await check('superadmin cannot be restricted by an override', 'allow', () => getDoc(doc(as('super1'), 'transactions/tx1')));

// ---- the access documents are unforgeable from a client ----
await check('staff reads own override', 'allow', () => getDoc(doc(as('admin2'), 'accessOverrides/admin2')));
await check("staff CANNOT read another's override", 'deny', () => getDoc(doc(as('admin1'), 'accessOverrides/admin2')));
await check('admin CANNOT grant themselves access', 'deny', () => setDoc(doc(as('admin1'), 'accessOverrides/admin1'), { grant: ['finance', 'orders'], revoke: [] }));
await check('admin CANNOT delete their own revokes', 'deny', () => deleteDoc(doc(as('admin3'), 'accessOverrides/admin3')));
await check('admin CANNOT rewrite role defaults', 'deny', () => setDoc(doc(as('admin1'), 'settings/accessControl'), { roleDefaults: { admin: ['orders', 'finance'] } }));
await check('superadmin CANNOT write role defaults directly either', 'deny', () => setDoc(doc(as('super1'), 'settings/accessControl'), { roleDefaults: { admin: ['orders'] } }));

// ---- changing a role default takes effect immediately ----
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'settings/accessControl'), { roleDefaults: { admin: ['support', 'users', 'settings', 'reports', 'finance'] } });
});
await check('after superadmin adds finance to admin defaults, admin reads top-ups', 'allow', () => getDoc(doc(as('admin1'), 'topups/tp1')));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'settings/accessControl'), { roleDefaults: { support: [] } });
});
await check('after superadmin empties support defaults, support loses tickets', 'deny', () => getDoc(doc(as('support1'), 'supportTickets/t1')));
await check('...and admin falls back to built-in defaults (no finance)', 'deny', () => getDoc(doc(as('admin1'), 'topups/tp1')));

await check('suspended customer is blocked', 'deny', () => getDoc(doc(as('suspended1'), 'settings/pricing')));
await check('signed-in user with no profile is blocked', 'deny', () => getDoc(doc(as('ghost'), 'settings/pricing')));

for (const [status, label] of results) console.log(`${status}  ${label}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} rule behaviours correct`);
await env.cleanup();
process.exit(failed ? 1 : 0);
