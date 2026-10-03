// One read behind the combined ledger screen.
//
// Six collections hold the money movements (see src/utils/ledger.js for why
// they cannot simply be concatenated). This returns them raw, plus a map of
// every person they mention, and lets the client shape them - so the row
// format, the filters, the totals and the CSV live in one tested file instead
// of being half here and half there.
//
// Why a callable rather than client queries: reading other people's top-ups
// and transfers is exactly what firestore.rules refuses, and should keep
// refusing. The capability check is the whole point of this function.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
// A year of history is a report; more than that is a data export nobody reads
// on a phone, and a range with no ceiling is how one call times out.
const MAX_DAYS = 366;
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

// The ledger's source key -> its collection and the fields the ledger reads.
// The keys are buildLedger's, not Firestore's: `fundingRequests` is one word
// shorter than its collection, and a mismatch here would silently drop a whole
// source from the report rather than fail.
//
// Listing the fields is not tidiness. A top-up document carries the customer's
// PIN history and a transaction carries the recharge PIN; a report has no
// business shipping either to a phone.
const SOURCES = {
  topups: ['topups', ['userId', 'userName', 'userPhone', 'amount', 'currency', 'creditedAmount', 'creditedCurrency', 'status', 'completedBy', 'completedAt', 'createdAt', 'refNo', 'method', 'rejectReason']],
  transactions: ['transactions', ['customerId', 'customerPhone', 'service', 'cost', 'total', 'currency', 'status', 'rejectReason', 'apiError', 'createdAt']],
  pointTransfers: ['pointTransfers', ['fromUid', 'fromName', 'toUid', 'toName', 'amount', 'currency', 'note', 'createdAt']],
  walletTransfers: ['walletTransfers', ['fromUid', 'toUid', 'amount', 'currency', 'recipientAmount', 'recipientCurrency', 'requestId', 'createdAt']],
  fundingRequests: ['walletFundingRequests', ['fromUid', 'fromName', 'amount', 'currency', 'transferredAmount', 'transferredCurrency', 'status', 'decidedBy', 'decidedAt', 'note', 'createdAt']],
  selfTopups: ['selfTopups', ['userId', 'userName', 'userPhone', 'amount', 'currency', 'status', 'refNo', 'method', 'createdAt']],
};

// Which fields on a row name a person, so the uid sweep does not have to know
// each collection's spelling twice.
const UID_FIELDS = ['userId', 'customerId', 'fromUid', 'toUid', 'completedBy', 'decidedBy'];

function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

/** The listed fields only, with every Timestamp flattened to a number. */
function project(doc, fields) {
  const data = doc.data() || {};
  const out = { id: doc.id };
  for (const f of fields) {
    const v = data[f];
    if (v === undefined) continue;
    out[f] = (v && typeof v.toMillis === 'function') ? v.toMillis() : v;
  }
  return out;
}

function clampRange(data) {
  const now = Date.now();
  const rawTo = Number(data?.toMs);
  const rawFrom = Number(data?.fromMs);
  const to = Number.isFinite(rawTo) && rawTo > 0 ? Math.min(rawTo, now + DAY) : now;
  const from = Number.isFinite(rawFrom) && rawFrom > 0 ? rawFrom : to - DEFAULT_DAYS * DAY;
  if (from >= to) throw new HttpsError('invalid-argument', 'The start of the range must come before its end.');
  if (to - from > MAX_DAYS * DAY) throw new HttpsError('invalid-argument', `A report can cover at most ${MAX_DAYS} days. Choose a shorter range.`);
  return { from, to };
}

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.round(n), MAX_LIMIT);
}

/** Every uid any row mentions, so the report can name people instead of ids. */
function collectUids(sources) {
  const uids = new Set();
  for (const rows of Object.values(sources)) {
    for (const row of rows) {
      for (const field of UID_FIELDS) {
        const v = row[field];
        if (typeof v === 'string' && v) uids.add(v);
      }
    }
  }
  return [...uids];
}

// getAll takes a bounded number of refs, so the sweep goes in chunks. A report
// over a busy month mentions far more than one chunk's worth of people.
const CHUNK = 100;

async function loadNames(db, uids) {
  const names = {};
  for (let i = 0; i < uids.length; i += CHUNK) {
    const refs = uids.slice(i, i + CHUNK).map((uid) => db.collection('users').doc(uid));
    const snaps = await db.getAll(...refs, { fieldMask: ['name', 'fullName', 'displayName', 'phone', 'role'] });
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data() || {};
      names[snap.id] = {
        name: String(d.name || d.fullName || d.displayName || '').trim(),
        phone: String(d.phone || '').trim(),
        role: String(d.role || ''),
      };
    }
  }
  return names;
}

// The client asserts these against src/utils/ledger.js's own list, so a rename
// on either side fails a test instead of quietly returning one source fewer.
exports.LEDGER_SOURCE_KEYS = Object.keys(SOURCES);

exports.getLedgerReport = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in again.');
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  const me = snap.exists ? (snap.data() || {}) : null;
  if (!me || me.suspended === true || me.inactive === true || me.disabled === true) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  if (!(await hasCapability(db, uid, me, 'reports'))) {
    throw new HttpsError('permission-denied', 'Your account cannot read money reports.');
  }

  const { from, to } = clampRange(request.data);
  const limit = clampLimit(request.data?.limitPerSource);
  const fromStamp = admin.firestore.Timestamp.fromMillis(from);
  const toStamp = admin.firestore.Timestamp.fromMillis(to);

  const keys = Object.keys(SOURCES);
  const snaps = await Promise.all(keys.map((key) => db.collection(SOURCES[key][0])
    .where('createdAt', '>=', fromStamp)
    .where('createdAt', '<=', toStamp)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()));

  const sources = {};
  const truncated = {};
  keys.forEach((key, i) => {
    sources[key] = snaps[i].docs.map((d) => project(d, SOURCES[key][1]));
    // Saying so beats a total that is quietly short: the newest `limit` rows
    // are a window, and a reader comparing against their own books needs to
    // know the window closed early.
    truncated[key] = snaps[i].size >= limit;
  });

  return { sources, names: await loadNames(db, collectUids(sources)), range: { from, to }, limit, truncated };
});
