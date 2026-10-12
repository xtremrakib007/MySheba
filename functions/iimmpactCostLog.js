'use strict';

// What IIMMPACT actually charged MySheba, order by order.
//
// The catalogue gives a selling rate (an NPR amount times
// denomination_unit_price, then IIMMPACT's adjustment), not MySheba's cost.
// The real wholesale cost only arrives with the result: `cost` on the
// /v2/topup reply and on the transaction callback. It is kept here, one
// document per order (the refid we sent), so a superadmin can see the rate
// IIMMPACT really applies to a product before setting MySheba's markup on it.
//
//   iimmpactCostLog/{refid}  { productCode, face, cost, rate, country, at }
//
// Server-only: rules give clients no access. Costs never reach a customer.

const LOG = 'iimmpactCostLog';

function money(value) {
  const raw = value && typeof value === 'object' ? (value.amount ?? value.value) : value;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : null;
}

/** IIMMPACT's recorded cost in a reply or callback body, or null. */
function costFrom(body) {
  if (!body || typeof body !== 'object') return null;
  const data = body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : body;
  return money(data.cost ?? data.cost_price ?? data.provider_cost ?? body.cost);
}

function docId(refid) {
  const id = String(refid || '').trim().replace(/[/\s]+/g, '_').slice(0, 200);
  return id && id !== '.' && id !== '..' ? id : '';
}

/**
 * Records one order's cost. `face` is the amount sent to IIMMPACT, in the
 * product's own currency. Merges, so the reply and the callback for the same
 * order write one document. Never throws: a missing log must not fail an order.
 */
async function record(db, { refid, productCode, face, cost, country = '', currency = '' }, now = new Date()) {
  const id = docId(refid);
  const amount = Number(face);
  const paid = money(cost);
  if (!id || !productCode || !(amount > 0) || paid === null) return false;
  try {
    await db.collection(LOG).doc(id).set({
      productCode: String(productCode).slice(0, 100),
      face: Math.round(amount * 10000) / 10000,
      cost: paid,
      rate: Math.round((paid / amount) * 1e8) / 1e8,
      country: String(country || '').toUpperCase().slice(0, 2),
      currency: String(currency || '').toUpperCase().slice(0, 8),
      at: now,
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('iimmpactCostLog write failed', String(error?.message || error).slice(0, 200));
    return false;
  }
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

/**
 * The latest recorded costs for one product, newest first, and the median
 * rate (cost per unit of face value) across them. Sorted in memory, so the
 * query needs no composite index.
 */
async function recent(db, productCode, limit = 10) {
  const snap = await db.collection(LOG).where('productCode', '==', String(productCode)).limit(200).get();
  const rows = snap.docs
    .map((doc) => doc.data() || {})
    .filter((row) => Number(row.face) > 0 && Number(row.cost) > 0)
    .sort((a, b) => millis(b.at) - millis(a.at))
    .slice(0, limit)
    .map((row) => ({ face: Number(row.face), cost: Number(row.cost), rate: Number(row.cost) / Number(row.face), at: millis(row.at) }));
  const rates = rows.map((row) => row.rate).sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  const medianRate = !rates.length ? null : rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
  return { rows, medianRate };
}

module.exports = { LOG, costFrom, record, recent };
