// Prepaid recharge PIN (e-PIN) inventory.
//
// A superadmin uploads batches of real operator reload PINs; the app hands
// one out when a Recharge order is fulfilled. PIN codes are money, so they
// never leave the server except onto the one transaction they were issued
// against: firestore.rules denies every client read of rechargePins, the
// admin panel reads stock through the summary callable below, and issuing is
// a transaction so the same code can never go to two customers.
//
// rechargePins/{id}
//   country, operator, denomination, currency
//   pin            the code itself
//   serial         optional operator serial/batch reference
//   status         'available' | 'assigned' | 'void'
//   batchId, uploadedBy, createdAt
//   expiresAt      optional
//   transactionId, assignedTo, assignedBy, assignedAt   (once issued)
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { logAudit, logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const COLLECTION = 'rechargePins';
const STAFF_ROLES = ['dealer', 'reseller', 'admin', 'superadmin'];
const MAX_BATCH = 500;
const MAX_PIN_LENGTH = 64;
const MAX_SERIAL_LENGTH = 64;

function activeAccount(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}

async function requireRole(request, roles) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || !roles.includes(profile.role)) throw new HttpsError('permission-denied', 'Your role cannot manage recharge PINs.');
  if (!activeAccount(profile)) throw new HttpsError('permission-denied', 'This account is not active.');
  return { db, uid: request.auth.uid, profile };
}

const cleanText = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

/** Same shape the stock is bucketed by, so upload and issue always agree. */
function stockKey(country, operator, denomination) {
  return `${String(country || '').toUpperCase()}|${String(operator || '').trim().toLowerCase()}|${Number(denomination) || 0}`;
}

/**
 * Uploads a batch of PINs for one country/operator/denomination.
 * Codes already present (same operator + same pin) are reported as
 * duplicates rather than stored twice.
 */
exports.uploadRechargePins = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { db, uid, profile } = await requireRole(request, ['superadmin']);
  const data = request.data || {};
  const country = cleanText(data.country, 4).toUpperCase();
  const operator = cleanText(data.operator, 60);
  const currency = cleanText(data.currency, 4).toUpperCase() || 'MYR';
  const denomination = Number(data.denomination);
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  const pins = Array.isArray(data.pins) ? data.pins : [];

  if (!country || !operator) throw new HttpsError('invalid-argument', 'Country and operator are required.');
  if (!Number.isFinite(denomination) || denomination <= 0) throw new HttpsError('invalid-argument', 'Enter a valid denomination.');
  if (!pins.length) throw new HttpsError('invalid-argument', 'Add at least one PIN.');
  if (pins.length > MAX_BATCH) throw new HttpsError('invalid-argument', `Upload at most ${MAX_BATCH} PINs at a time.`);
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new HttpsError('invalid-argument', 'That expiry date is not valid.');

  const cleaned = [];
  const seen = new Set();
  for (const entry of pins) {
    const pin = cleanText(typeof entry === 'string' ? entry : entry?.pin, MAX_PIN_LENGTH);
    if (!pin) continue;
    if (seen.has(pin)) continue;
    seen.add(pin);
    cleaned.push({ pin, serial: cleanText(typeof entry === 'string' ? '' : entry?.serial, MAX_SERIAL_LENGTH) });
  }
  if (!cleaned.length) throw new HttpsError('invalid-argument', 'None of those lines contained a PIN.');

  // Existing codes for this operator, so a re-uploaded file does not
  // duplicate stock.
  const existingSnap = await db.collection(COLLECTION)
    .where('stockKey', '==', stockKey(country, operator, denomination))
    .where('status', '==', 'available')
    .get();
  const existing = new Set(existingSnap.docs.map((d) => d.data().pin));

  const batchId = crypto.randomBytes(8).toString('hex');
  let added = 0;
  let duplicates = 0;
  let writer = db.batch();
  let pending = 0;

  for (const item of cleaned) {
    if (existing.has(item.pin)) { duplicates += 1; continue; }
    const ref = db.collection(COLLECTION).doc();
    writer.set(ref, {
      country, operator, currency, denomination,
      stockKey: stockKey(country, operator, denomination),
      pin: item.pin,
      serial: item.serial || null,
      status: 'available',
      batchId,
      uploadedBy: uid,
      expiresAt: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    added += 1;
    pending += 1;
    // Firestore caps a batch at 500 writes.
    if (pending === 400) { await writer.commit(); writer = db.batch(); pending = 0; }
  }
  if (pending) await writer.commit();

  await logAudit({
    action: 'recharge_pins_uploaded',
    targetUid: null,
    performedBy: uid,
    performedByRole: profile.role,
    // Never the codes themselves.
    details: { country, operator, denomination, currency, added, duplicates, batchId },
  });

  return { added, duplicates, batchId };
});

/**
 * Issues one PIN for a pending Recharge order and writes it onto the
 * transaction, where the customer and the operator can both see it.
 */
exports.issueRechargePin = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { db, uid, profile } = await requireRole(request, STAFF_ROLES);
  const transactionId = cleanText(request.data?.transactionId, 128);
  if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');

  const txRef = db.collection('transactions').doc(transactionId);
  const txSnap = await txRef.get();
  if (!txSnap.exists) throw new HttpsError('not-found', 'That order does not exist.');
  const tx = txSnap.data();

  if (tx.service !== 'Recharge') throw new HttpsError('failed-precondition', 'Only a Recharge order can be given a PIN.');
  if (tx.rejected === true) throw new HttpsError('failed-precondition', 'That order was rejected.');
  if (tx.pin) throw new HttpsError('failed-precondition', 'That order already has a PIN.');
  if (profile.role === 'dealer' && tx.dealerId && tx.dealerId !== uid) throw new HttpsError('permission-denied', 'That order belongs to another dealer.');
  if (profile.role === 'reseller' && tx.resellerId && tx.resellerId !== uid) throw new HttpsError('permission-denied', 'That order belongs to another reseller.');

  const raw = tx.raw || {};
  const country = String(raw.country || '').toUpperCase();
  const operator = String(raw.operator || '');
  const denomination = Number(raw.amount);
  if (!country || !operator || !Number.isFinite(denomination)) {
    throw new HttpsError('failed-precondition', 'That order is missing the operator or amount needed to match a PIN.');
  }

  const now = admin.firestore.Timestamp.now();
  const candidates = await db.collection(COLLECTION)
    .where('stockKey', '==', stockKey(country, operator, denomination))
    .where('status', '==', 'available')
    .limit(10)
    .get();

  const usable = candidates.docs.filter((d) => {
    const expiry = d.data().expiresAt;
    return !expiry || expiry.toMillis() > now.toMillis();
  });
  if (!usable.length) {
    throw new HttpsError('failed-precondition', `No ${operator} ${denomination} PIN is left in stock. Upload more from the admin panel.`);
  }

  let issued = null;
  // Take the PIN inside a transaction so two operators cannot be handed the
  // same code; if the first candidate was taken meanwhile, try the next.
  for (const candidate of usable) {
    try {
      issued = await db.runTransaction(async (t) => {
        const pinSnap = await t.get(candidate.ref);
        if (!pinSnap.exists || pinSnap.data().status !== 'available') return null;
        const freshTx = await t.get(txRef);
        if (!freshTx.exists) throw new HttpsError('not-found', 'That order does not exist.');
        if (freshTx.data().pin) throw new HttpsError('failed-precondition', 'That order already has a PIN.');
        const pinData = pinSnap.data();
        t.update(candidate.ref, {
          status: 'assigned',
          transactionId,
          assignedTo: freshTx.data().customerId || null,
          assignedBy: uid,
          assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        t.update(txRef, {
          pin: pinData.pin,
          pinSerial: pinData.serial || null,
          pinSource: 'voucher',
          pinIssuedBy: uid,
          pinIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
          pinExpiresAt: pinData.expiresAt || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { pin: pinData.pin, serial: pinData.serial || null, expiresAt: pinData.expiresAt ? pinData.expiresAt.toMillis() : null };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      await logServerError('issueRechargePin', error, { userId: uid });
      throw new HttpsError('internal', 'Could not issue a PIN. Please try again.');
    }
    if (issued) break;
  }

  if (!issued) throw new HttpsError('failed-precondition', 'That PIN was just taken. Try again.');

  await logAudit({
    action: 'recharge_pin_issued',
    targetUid: tx.customerId || null,
    performedBy: uid,
    performedByRole: profile.role,
    details: { transactionId, country, operator, denomination },
  });

  return issued;
});

/** Takes a bad code out of circulation. */
exports.voidRechargePin = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { db, uid, profile } = await requireRole(request, ['superadmin']);
  const pinId = cleanText(request.data?.pinId, 128);
  const reason = cleanText(request.data?.reason, 300);
  if (!pinId) throw new HttpsError('invalid-argument', 'pinId is required.');
  const ref = db.collection(COLLECTION).doc(pinId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That PIN does not exist.');
  if (snap.data().status === 'assigned') throw new HttpsError('failed-precondition', 'That PIN was already issued to a customer.');
  await ref.update({ status: 'void', voidReason: reason || null, voidedBy: uid, voidedAt: admin.firestore.FieldValue.serverTimestamp() });
  await logAudit({ action: 'recharge_pin_voided', targetUid: null, performedBy: uid, performedByRole: profile.role, details: { pinId, reason } });
  return { ok: true };
});

/**
 * Stock levels per country/operator/denomination. Returns counts only - the
 * codes themselves stay on the server.
 */
exports.rechargePinStock = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { db } = await requireRole(request, STAFF_ROLES);
  const snap = await db.collection(COLLECTION).where('status', '==', 'available').get();
  const now = Date.now();
  const buckets = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    const expired = data.expiresAt && data.expiresAt.toMillis() <= now;
    const key = data.stockKey || stockKey(data.country, data.operator, data.denomination);
    const bucket = buckets.get(key) || {
      country: data.country || '',
      operator: data.operator || '',
      denomination: Number(data.denomination) || 0,
      currency: data.currency || 'MYR',
      available: 0,
      expired: 0,
    };
    if (expired) bucket.expired += 1; else bucket.available += 1;
    buckets.set(key, bucket);
  });
  const rows = Array.from(buckets.values()).sort((a, b) =>
    a.country.localeCompare(b.country) || a.operator.localeCompare(b.operator) || a.denomination - b.denomination
  );
  return { rows };
});
