const admin = require('firebase-admin');
const { sanitizeTransaction } = require('../transactionQueueService');

admin.initializeApp();
const db = admin.firestore();

const PAGE_SIZE = 400;

async function run() {
  let last = null;
  let scanned = 0;
  let queued = 0;
  let removed = 0;

  for (;;) {
    let query = db.collection('transactions')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      scanned += 1;
      const tx = doc.data() || {};
      const queue = sanitizeTransaction(doc.id, tx);
      const ref = db.collection('transactionQueue').doc(doc.id);
      const keep = queue && tx.rejected !== true && ['pending', 'processing', 'completed'].includes(queue.status)
        && !(queue.status === 'completed' && !queue.claimedBy);

      if (keep) {
        batch.set(ref, queue, { merge: false });
        queued += 1;
      } else {
        batch.delete(ref);
        removed += 1;
      }
    }

    await batch.commit();
    last = snap.docs[snap.docs.length - 1];
    console.log(`Processed ${scanned} transactions; queued=${queued}; removed=${removed}`);

    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`Backfill complete. scanned=${scanned}; queued=${queued}; removed=${removed}`);
}

run().catch(error => {
  console.error('Transaction queue backfill failed:', error);
  process.exitCode = 1;
});
