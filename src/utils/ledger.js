// Every movement of money, in one shape.
//
// Six collections record money moving and none of them agree: a top-up names
// its user as `userId`, an order calls the same person `customerId`, a staff
// transfer has `fromUid`/`toUid`, and a funding request keeps its amount in
// `transferredAmount` because `amount` is what was asked for rather than what
// was sent. So a report built per collection shows four partial pictures and
// no total, and a row that says "50.00 moved" without saying between whom
// cannot be checked against a person.
//
// Normalising first means one list, one sort, one filter and one export - and
// adding a seventh source later is a function here, not a screen.
//
// Names are passed in rather than looked up: this file has no Firestore and no
// React, so the whole thing can be tested against rows a test writes itself.

const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const millis = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A person, as the report should name them: who, not which id. */
function who(names, uid, fallbackName = '', fallbackPhone = '') {
  const id = String(uid || '');
  const found = (names && names[id]) || null;
  const name = String(found?.name || fallbackName || '').trim();
  const phone = String(found?.phone || fallbackPhone || '').trim();
  return {
    id,
    name: name || (id ? `Unknown (${id.slice(0, 6)}…)` : '—'),
    phone,
    role: String(found?.role || ''),
  };
}

const SYSTEM = { id: '', name: 'MySheba', phone: '', role: 'system' };

/**
 * One ledger row per record, whatever collection it came from.
 *
 * `sources` is { topups, transactions, pointTransfers, walletTransfers,
 * fundingRequests, selfTopups }, each an array; anything missing is skipped,
 * so a screen can show what it has while the rest loads.
 */
export function buildLedger(sources = {}, names = {}) {
  const rows = [];
  const push = (r) => { if (r) rows.push(r); };

  for (const t of sources.topups || []) {
    const user = who(names, t.userId, t.userName, t.userPhone);
    push({
      id: `topup:${t.id}`, kind: 'topup', label: 'Wallet top-up',
      at: millis(t.completedAt || t.createdAt), amount: money(t.creditedAmount ?? t.amount),
      currency: t.creditedCurrency || t.currency || 'MYR',
      status: t.status || 'pending',
      // The approver pays for a top-up out of their own wallet, so they are
      // the other side of it - not the system.
      from: t.completedBy ? who(names, t.completedBy) : SYSTEM,
      to: user,
      reference: t.refNo || '', note: t.rejectReason || t.method || '',
    });
  }

  for (const t of sources.transactions || []) {
    const customer = who(names, t.customerId, t.customerName, t.customerPhone);
    push({
      id: `tx:${t.id}`, kind: 'order', label: t.service || 'Order',
      at: millis(t.createdAt), amount: money(t.cost ?? t.total),
      currency: t.currency || 'MYR', status: t.status || 'pending',
      from: customer,
      to: { id: '', name: t.service || 'Service', phone: '', role: 'service' },
      reference: t.raw?.requestId || '', note: t.rejectReason || t.apiError || '',
    });
  }

  for (const t of sources.pointTransfers || []) {
    push({
      id: `pt:${t.id}`, kind: 'transfer', label: 'Staff transfer',
      at: millis(t.createdAt), amount: money(t.amount), currency: t.currency || 'MYR',
      status: 'completed',
      from: who(names, t.fromUid, t.fromName), to: who(names, t.toUid, t.toName),
      reference: '', note: t.note || '',
    });
  }

  for (const t of sources.walletTransfers || []) {
    push({
      id: `wt:${t.id}`, kind: 'transfer', label: 'Wallet transfer',
      at: millis(t.createdAt), amount: money(t.amount), currency: t.currency || 'MYR',
      status: 'completed',
      from: who(names, t.fromUid), to: who(names, t.toUid),
      reference: t.requestId || '', note: '',
    });
  }

  for (const t of sources.fundingRequests || []) {
    // Only an approved request moved money. A pending or rejected one is a
    // conversation, and putting it in a ledger would overstate what was paid.
    if (t.status !== 'approved') continue;
    push({
      id: `fund:${t.id}`, kind: 'funding', label: 'Wallet funding',
      at: millis(t.decidedAt || t.createdAt),
      amount: money(t.transferredAmount ?? t.amount),
      currency: t.transferredCurrency || t.currency || 'MYR', status: 'completed',
      from: who(names, t.decidedBy), to: who(names, t.fromUid, t.fromName),
      reference: '', note: t.note || '',
    });
  }

  for (const t of sources.selfTopups || []) {
    push({
      id: `self:${t.id}`, kind: 'topup', label: 'Self top-up',
      at: millis(t.createdAt), amount: money(t.amount), currency: t.currency || 'MYR',
      status: t.status || 'approved',
      from: SYSTEM, to: who(names, t.userId, t.userName, t.userPhone),
      reference: t.refNo || '', note: t.method || '',
    });
  }

  return rows.sort((a, b) => b.at - a.at);
}

/** Narrow a ledger without rebuilding it. */
export function filterLedger(rows, { kind, status, uid, from, to, search } = {}) {
  const term = String(search || '').trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (kind && kind !== 'all' && r.kind !== kind) return false;
    if (status && status !== 'all' && r.status !== status) return false;
    if (uid && r.from.id !== uid && r.to.id !== uid) return false;
    if (from && r.at < from) return false;
    if (to && r.at > to) return false;
    if (!term) return true;
    return [r.label, r.from.name, r.from.phone, r.to.name, r.to.phone, r.reference, r.note]
      .some((v) => String(v || '').toLowerCase().includes(term));
  });
}

/** Total per currency. Summing across currencies would be a made-up number. */
export function totalsByCurrency(rows) {
  const out = {};
  for (const r of rows || []) {
    out[r.currency] = Math.round(((out[r.currency] || 0) + r.amount) * 100) / 100;
  }
  return out;
}

const CSV_COLUMNS = ['Date', 'Type', 'Detail', 'From', 'From phone', 'To', 'To phone', 'Amount', 'Currency', 'Status', 'Reference', 'Note'];

// A name with a comma, or a note someone typed a newline into, would otherwise
// shift every later column by one and quietly corrupt the file.
function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The ledger as CSV, for accounting, a dispute, or whoever asks. */
export function ledgerToCsv(rows, formatDate = (ms) => new Date(ms).toISOString()) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows || []) {
    lines.push([
      r.at ? formatDate(r.at) : '', r.kind, r.label,
      r.from.name, r.from.phone, r.to.name, r.to.phone,
      r.amount.toFixed(2), r.currency, r.status, r.reference, r.note,
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}

export const LEDGER_KINDS = ['all', 'topup', 'order', 'transfer', 'funding'];
