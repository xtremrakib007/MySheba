/**
 * Phase 10 migration helper: convert legacy Sub Dealer accounts to Dealer.
 *
 * Run with Firebase Admin credentials in a controlled maintenance window.
 * This script is intentionally NOT part of the app startup/build and is not
 * executed automatically. It preserves the user's other profile fields and
 * removes the legacy parent dealerId because Dealer is now a flat tier.
 */
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const snap = await db.collection('users').where('role', '==', 'subdealer').get();
  if (snap.empty) {
    console.log('No legacy subdealer accounts found.');
    return;
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { role: 'dealer', dealerId: admin.firestore.FieldValue.delete() });
  });
  await batch.commit();
  console.log(`Converted ${snap.size} legacy subdealer account(s) to dealer.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
