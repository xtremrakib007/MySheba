'use strict';

// JomPAY's biller directory (IIMMPACT GET /v1/jompay/billers), made usable.
//
// A JomPAY payment names its biller by a 4-6 digit code printed on the bill.
// The customer typed it with nothing to check it against, so a mistyped code
// was only found out when IIMMPACT refused the order. With the directory, the
// app shows the biller's name as the code is typed, and can find a biller by
// name.
//
// IIMMPACT's response shape is read defensively - the list may sit under
// `data`, `data.billers`, `billers` or `items`, and each entry may spell its
// code and name several ways - so a renamed field degrades to "no directory"
// (the lookup says nothing and payment still works) rather than to wrong
// answers.
//
// Pure: no network, no Firestore. apiProviderService fetches and caches.

const text = (v) => (v == null ? '' : String(v).trim());

function listOf(json) {
  const candidates = [
    json?.data?.billers, json?.data?.items, json?.data,
    json?.billers, json?.items, json,
  ];
  return candidates.find((value) => Array.isArray(value)) || [];
}

/** The directory as [{ code, name }], codes unique and digits only. */
function normalizeBillers(json) {
  const seen = new Set();
  const out = [];
  for (const entry of listOf(json)) {
    if (!entry || typeof entry !== 'object') continue;
    const code = text(entry.biller_code ?? entry.billerCode ?? entry.code ?? entry.id).replace(/\s+/g, '');
    // IIMMPACT names the biller in `display_name`.
    const name = text(entry.display_name ?? entry.displayName ?? entry.biller_name ?? entry.billerName ?? entry.name ?? entry.description).slice(0, 200);
    if (!/^\d{3,10}$/.test(code) || !name || seen.has(code)) continue;
    seen.add(code);
    const amount = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    const biller = { code, name };
    // Each biller's own payment limits and IIMMPACT's (advisory) category.
    if (amount(entry.min) !== null) biller.min = amount(entry.min);
    if (amount(entry.max) !== null) biller.max = amount(entry.max);
    const category = text(entry.suggested_category).slice(0, 60);
    if (category) biller.category = category;
    out.push(biller);
  }
  return out;
}

/** The biller with this code, or null. */
function findBiller(billers, code) {
  const wanted = text(code).replace(/\s+/g, '');
  if (!wanted) return null;
  return (Array.isArray(billers) ? billers : []).find((b) => b && b.code === wanted) || null;
}

/** Up to `limit` billers whose name (or code) contains every word of `query`. */
function searchBillers(billers, query, limit = 20) {
  const words = text(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return (Array.isArray(billers) ? billers : [])
    .filter((b) => b && words.every((w) => b.name.toLowerCase().includes(w) || b.code.includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

module.exports = { normalizeBillers, findBiller, searchBillers };
