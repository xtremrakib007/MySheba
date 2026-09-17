// Every account - however it's created (phone+PIN self-registration,
// Google sign-in, or a staff-created account via manageUser) - gets a
// short numeric userId (4 or 5 digits, i.e. 1000-99999) in addition to its
// Firebase Auth uid. The uid is a long opaque string that's fine for the
// database but useless to read aloud; the numeric ID is what shows on the
// Profile screen and is what a customer would give support/a dealer over
// the phone to be looked up.
//
// Uniqueness is enforced with a `userIds/{id}` reservation collection -
// one doc per numeric ID, doc ID == the number itself as a string. Each
// attempt runs inside a transaction that reads the candidate doc and only
// creates the reservation when the reservation didn't already exist.
const admin = require('firebase-admin');
const crypto = require('crypto');

function randomUserId() {
  const digits = crypto.randomInt(0, 2) === 0 ? 4 : 5;
  const min = digits === 4 ? 1000 : 10000;
  const max = digits === 4 ? 9999 : 99999;
  return String(crypto.randomInt(min, max + 1));
}

async function assignUniqueUserId(db, uid) {
  const MAX_ATTEMPTS = 20;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomUserId();
    const idRef = db.collection('userIds').doc(candidate);
    try {
      const assigned = await db.runTransaction(async (tx) => {
        const snap = await tx.get(idRef);
        if (snap.exists) return false;
        tx.set(idRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return true;
      });
      if (assigned) return candidate;
    } catch (err) {
      // Transaction conflict or transient error - retry with a fresh candidate.
    }
  }
  throw new Error('Could not assign a unique user ID. Please try again.');
}

module.exports = { assignUniqueUserId };
