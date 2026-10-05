const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { hasCapability } = require('./accessControl');
const { logAudit } = require('./logService');
const { readInvoice, approvalDecision, invoiceNumber, INVOICE_KINDS } = require('./invoiceRules');
const { renderInvoiceHtml } = require('./invoiceDocument');

const COLLECTION = 'invoices';
const COUNTER = 'counters/invoiceNumbers';

/**
 * The caller, with the name and role that go on the record.
 *
 * Read fresh from the profile rather than taken from the token: the two names
 * on an invoice are the whole point of it, and a stale display name on a
 * payment record is the kind of thing nobody notices until it matters.
 */
async function actorOf(db, request, capability) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const snap = await db.collection('users').doc(uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || profile.suspended === true || profile.inactive === true
      || profile.disabled === true || profile.active === false || profile.mergedInto) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  if (!(await hasCapability(db, uid, profile, capability))) {
    throw new HttpsError('permission-denied', 'Your account does not handle invoices.');
  }
  return {
    uid,
    name: String(profile.name || profile.displayName || profile.email || '').trim().slice(0, 200),
    role: String(profile.role || '').slice(0, 40),
  };
}

/**
 * The next invoice number, allocated inside the caller's transaction.
 *
 * A counter rather than a count of the collection: counting would hand the same
 * number to two people raising an invoice in the same second, and an invoice
 * number that is not unique is not an invoice number.
 */
async function nextNumber(tx, db, year) {
  const ref = db.doc(COUNTER);
  const snap = await tx.get(ref);
  const data = snap.exists ? (snap.data() || {}) : {};
  // Restarts at 1 each year, which is what the MSI-<year>-<n> shape implies.
  const sequence = Number(data.year) === year ? Number(data.next || 1) : 1;
  if (!Number.isInteger(sequence) || sequence < 1) throw new HttpsError('internal', 'The invoice counter is unreadable.');
  const number = invoiceNumber(year, sequence);
  if (!number) throw new HttpsError('internal', 'The invoice number could not be formed.');
  tx.set(ref, { year, next: sequence + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return number;
}

exports.createInvoice = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  const actor = await actorOf(db, request, 'finance');

  const parsed = readInvoice(request.data);
  if (!parsed.ok) throw new HttpsError('invalid-argument', parsed.reason);

  const ref = db.collection(COLLECTION).doc();
  const year = new Date().getUTCFullYear();
  const number = await db.runTransaction(async (tx) => {
    const allocated = await nextNumber(tx, db, year);
    tx.set(ref, {
      ...parsed.invoice,
      number: allocated,
      status: 'pending',
      // Who raised it, and when. Written by the server from the server's clock,
      // because a date the client could choose is not evidence of anything.
      createdBy: actor.uid,
      createdByName: actor.name,
      createdByRole: actor.role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // Set only by a decision, and never by the person above.
      approvedBy: null, approvedByName: '', approvedByRole: '', approvedAt: null,
      decisionNote: '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return allocated;
  });

  await logAudit({
    action: 'invoice_raised', targetUid: actor.uid,
    performedBy: actor.uid, performedByRole: actor.role,
    details: { invoiceId: ref.id, number, kind: parsed.invoice.kind, amount: parsed.invoice.amount, currency: parsed.invoice.currency, party: parsed.invoice.party },
  });

  return { id: ref.id, number, status: 'pending' };
});

/**
 * Approve or reject, which are the same transaction with a different word in
 * it - so they share one implementation and cannot drift into treating the
 * self-approval rule differently.
 */
function decide(action) {
  return onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
    const db = admin.firestore();
    const actor = await actorOf(db, request, 'finance');
    const id = String(request.data?.invoiceId || '').trim().slice(0, 100);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'An invoice id is required.');
    const note = String(request.data?.note || '').trim().slice(0, 1000);
    if (action === 'rejected' && !note) throw new HttpsError('invalid-argument', 'Say why this invoice is being rejected.');

    const ref = db.collection(COLLECTION).doc(id);
    const stored = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const invoice = snap.exists ? snap.data() : null;
      // Re-read inside the transaction: two approvers pressing at once must
      // not both win, and the first decision is the one that stands.
      const allowed = approvalDecision({ invoice, actorUid: actor.uid });
      if (!allowed.ok) throw new HttpsError('failed-precondition', allowed.reason);
      tx.update(ref, {
        status: action,
        approvedBy: actor.uid,
        approvedByName: actor.name,
        approvedByRole: actor.role,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        decisionNote: note,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return invoice;
    });

    await logAudit({
      action: action === 'approved' ? 'invoice_approved' : 'invoice_rejected',
      targetUid: String(stored.createdBy || ''),
      performedBy: actor.uid, performedByRole: actor.role,
      details: { invoiceId: id, number: String(stored.number || ''), amount: Number(stored.amount || 0), currency: String(stored.currency || ''), raisedBy: String(stored.createdBy || ''), note },
    });

    return { id, status: action };
  });
}

exports.approveInvoice = decide('approved');
exports.rejectInvoice = decide('rejected');

/**
 * The history, newest first.
 *
 * 'reports' reads it as well as 'finance': the point of keeping these is that
 * somebody can look back at what was paid to a provider, and that is a
 * reporting question as much as a finance one.
 */
exports.listInvoices = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  let actor;
  try { actor = await actorOf(db, request, 'finance'); }
  catch (error) {
    if (error?.code !== 'permission-denied') throw error;
    actor = await actorOf(db, request, 'reports');
  }

  const kind = String(request.data?.kind || '').trim();
  const limit = Math.max(1, Math.min(200, Number(request.data?.limit) || 50));
  let query = db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit);
  if (INVOICE_KINDS.includes(kind)) query = db.collection(COLLECTION).where('kind', '==', kind).orderBy('createdAt', 'desc').limit(limit);

  const snap = await query.get();
  const millis = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : null);
  return {
    invoices: snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        number: String(d.number || ''), kind: String(d.kind || ''), party: String(d.party || ''),
        amount: Number(d.amount || 0), currency: String(d.currency || ''),
        reference: String(d.reference || ''), notes: String(d.notes || ''),
        status: String(d.status || ''),
        createdBy: String(d.createdBy || ''), createdByName: String(d.createdByName || ''),
        createdByRole: String(d.createdByRole || ''), createdAt: millis(d.createdAt),
        approvedBy: String(d.approvedBy || ''), approvedByName: String(d.approvedByName || ''),
        approvedByRole: String(d.approvedByRole || ''), approvedAt: millis(d.approvedAt),
        decisionNote: String(d.decisionNote || ''),
      };
    }),
    viewerRole: actor.role,
  };
});

/**
 * One invoice as a printable document.
 *
 * Rendered here rather than on the screen that asked, so the sheet somebody
 * files or sends says what the stored record says - not what a browser tab had
 * in state. Same capability as the list: 'finance' raises and decides,
 * 'reports' can look back at what was paid.
 */
exports.getInvoiceDocument = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  try { await actorOf(db, request, 'finance'); }
  catch (error) {
    if (error?.code !== 'permission-denied') throw error;
    await actorOf(db, request, 'reports');
  }

  const id = String(request.data?.invoiceId || '').trim().slice(0, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'An invoice id is required.');

  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That invoice no longer exists.');
  const d = snap.data() || {};
  const millis = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : null);

  return {
    number: String(d.number || ''),
    html: renderInvoiceHtml({
      number: d.number, kind: d.kind, party: d.party, amount: d.amount, currency: d.currency,
      reference: d.reference, notes: d.notes, status: d.status,
      createdByName: d.createdByName, createdByRole: d.createdByRole, createdAt: millis(d.createdAt),
      approvedByName: d.approvedByName, approvedByRole: d.approvedByRole, approvedAt: millis(d.approvedAt),
      decisionNote: d.decisionNote,
    }),
  };
});
