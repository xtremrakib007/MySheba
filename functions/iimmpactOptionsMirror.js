'use strict';

// MySheba's own copy of each IIMMPACT product's amount list.
//
// Tapping a product used to wait on getIimmpactOptions: a Cloud Function that
// had often gone to sleep, then IIMMPACT's /v2/options - several seconds for
// a list of RM 5 / RM 10 / RM 30 that is the same for every customer. Those
// lists are now kept in Firestore, one document per product field:
//
//   iimmpactOptionsMirror/{productCode__fieldId}  { json, count, savedAt, ... }
//
// The app reads the document directly (rules allow signed-in reads), so the
// amounts draw without waking a function or calling IIMMPACT. An hourly
// schedule refills every list, and getIimmpactOptions refreshes one whenever
// it has to ask IIMMPACT anyway.
//
// Only lists that do not depend on what the customer types are kept: no
// account number (a bill's outstanding amounts), no biller code, nothing
// whose data_source reads another field. Those stay live.
//
// What is stored is publicIimmpactOptions' answer - the customer-safe shape.

const MIRROR = 'iimmpactOptionsMirror';
// A Firestore document holds at most 1 MiB; 250k characters stays clear of it
// even if every character took four bytes.
const MAX_CHARS = 250000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** The document id for one product field. Firestore ids may not contain '/'. */
function docId(productCode, fieldId) {
  const clean = (v) => String(v || '').trim().replace(/[/\s]+/g, '_').slice(0, 200);
  return `${clean(productCode)}__${clean(fieldId)}`;
}

/**
 * The select fields of a product whose list can be shared: a data_source that
 * names no other field (no depends_on, no param read `from_field`). Returns
 * the product code and field id the list is asked for by - a data_source can
 * name a different product or field than its own.
 */
function shareableOptionFields(product) {
  const fields = Array.isArray(product?.fields) ? product.fields : [];
  const out = [];
  for (const field of fields) {
    if (!field || field.type !== 'select' || !field.id) continue;
    const source = field.data_source && typeof field.data_source === 'object' ? field.data_source : {};
    if (Array.isArray(source.depends_on) && source.depends_on.length) continue;
    const params = source.params && typeof source.params === 'object' ? source.params : {};
    if (Object.values(params).some((spec) => spec && typeof spec === 'object' && spec.from_field)) continue;
    const staticOf = (spec) => (spec && typeof spec === 'object' && spec.static !== undefined ? String(spec.static) : '');
    out.push({
      productCode: staticOf(params.product_code) || String(product.code || ''),
      fieldId: staticOf(params.field_id) || String(field.id),
    });
  }
  return out.filter((item) => item.productCode && item.fieldId);
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** Saves one list. Lists too large for a document are skipped (they stay live). */
async function write(db, productCode, fieldId, answer, { now = new Date() } = {}) {
  const json = JSON.stringify(answer || {});
  if (json.length > MAX_CHARS) return false;
  await db.collection(MIRROR).doc(docId(productCode, fieldId)).set({
    productCode: String(productCode).slice(0, 200),
    fieldId: String(fieldId).slice(0, 200),
    json,
    count: Array.isArray(answer?.items) ? answer.items.length : 0,
    savedAt: now,
  });
  return true;
}

/** One saved list and its age, or null. */
async function read(db, productCode, fieldId, { now = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  const snap = await db.collection(MIRROR).doc(docId(productCode, fieldId)).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (typeof data.json !== 'string') return null;
  if (now - millis(data.savedAt) >= maxAgeMs) return null;
  try { return JSON.parse(data.json); } catch (_) { return null; }
}

module.exports = { MIRROR, MAX_CHARS, MAX_AGE_MS, docId, shareableOptionFields, write, read };
