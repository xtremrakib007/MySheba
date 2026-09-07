// ONE-TIME backfill for the "🏢 Business" feed badge (PRD section 15).
//
// sellerIsBusiness/ownerIsBusiness (marketplaceService.createListing,
// accommodationService.createProperty, serviceProviderService.createProvider)
// is a creation-time snapshot, same as sellerVerified always was - so any
// business granted status *before* this feature shipped won't show the
// badge on posts they already had live until they edit or re-post one.
// This script patches those existing docs once so the badge appears
// immediately instead of waiting on that.
//
// Not deployed as a Cloud Function - run it manually, once, from a machine
// with Admin SDK credentials for the project (same `firebase login` +
// `gcloud auth application-default login` setup used to deploy):
//
//   cd functions
//   node scripts/backfillBusinessFlags.js
//
// Safe to re-run: it only ever patches docs whose flag doesn't already
// match, so a second run is a no-op.

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Firestore 'in' queries cap at 30 values per query.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function patchCollection(collectionName, ownerField, flagField, businessUids) {
  let patched = 0;
  for (const batch of chunk(businessUids, 30)) {
    const snap = await db.collection(collectionName).where(ownerField, 'in', batch).get();
    const writer = db.batch();
    let inBatch = 0;
    snap.forEach((doc) => {
      if (doc.data()[flagField] === true) return; // already set, e.g. a re-run
      writer.update(doc.ref, { [flagField]: true });
      inBatch += 1;
    });
    if (inBatch > 0) {
      await writer.commit();
      patched += inBatch;
    }
  }
  console.log(`${collectionName}: patched ${patched} doc(s)`);
}

async function main() {
  const bizSnap = await db.collection('businessProfiles').where('isBusinessProfile', '==', true).get();
  const businessUids = bizSnap.docs.map((d) => d.id);
  console.log(`Found ${businessUids.length} currently-granted Business Profile(s).`);
  if (businessUids.length === 0) return;

  await patchCollection('marketplaceListings', 'sellerId', 'sellerIsBusiness', businessUids);
  await patchCollection('properties', 'ownerId', 'ownerIsBusiness', businessUids);
  await patchCollection('serviceProviders', 'ownerId', 'ownerIsBusiness', businessUids);
}

main()
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch((err) => { console.error('Backfill failed:', err); process.exit(1); });
