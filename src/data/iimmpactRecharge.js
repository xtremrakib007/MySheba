// Which IIMMPACT products are a prepaid recharge for one country.
//
// The catalogue files Malaysian airtime under "Mobile" > "Mobile Prepaid" and
// other countries' airtime under "International Topup". The operator step used
// to accept a category only when its name said recharge, airtime, top up,
// "prepaid reload" or "mobile reload" - so "Mobile Prepaid" never qualified,
// "International Topup" was the only recharge category, and its products are
// named after countries, which the step drops as not being operators. Every
// Malaysian operator IIMMPACT sells was hidden and the step said there were
// none.
//
// Pure, so the answer for a real catalogue shape can be checked in a test.

const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Bills, postpaid accounts and utility billers are never airtime, whatever
// group they sit under.
const BILL_TAXONOMY = /post.?paid|bill.?payment|bill.?pay|biller|utility|electricity|water bill|gas bill|invoice|jom.?pay/i;
const BILL_TEXT = /\b(post.?paid|bill.?payment|bill.?pay|biller|utility bill|electricity bill|water bill|gas bill|invoice|jom.?pay)\b/i;
const RECHARGE_TAXONOMY = /recharge|airtime|top.?up|prepaid|reload|mobile.?credit/i;
const INTERNATIONAL_TAXONOMY = /international|intl|global|overseas|cross.?border|idd/i;
// Data plans and PIN vouchers have their own tiles.
const NOT_AIRTIME_TAXONOMY = /\bdata\b|internet|broadband|\bpins?\b|voucher|wallet|game|gaming/i;

/**
 * The recharge products for `country`, one per product code, in catalogue
 * order. `countryName` is that country's display name ("Indonesia"), used to
 * pick its products out of the international category.
 */
export function rechargeProductsFromCatalog(catalog, { country = 'MY', countryName = '', staticOperators = [], countryNames = [] } = {}) {
  const products = catalog && catalog.products && typeof catalog.products === 'object' ? catalog.products : {};
  const groups = Array.isArray(catalog && catalog.tree && catalog.tree.groups) ? catalog.tree.groups : [];
  const domestic = String(country || '').toUpperCase() === 'MY';
  const rechargeCodes = new Set();
  const internationalCodes = new Set();
  const billCodes = new Set();
  for (const group of groups) {
    for (const category of (Array.isArray(group && group.categories) ? group.categories : [])) {
      const taxonomy = String((group && group.name) || '') + ' ' + String((category && category.name) || '');
      const categoryName = String((category && category.name) || '');
      const codes = (Array.isArray(category && category.product_codes) ? category.product_codes : []).map(String);
      if (BILL_TAXONOMY.test(taxonomy)) { for (const code of codes) billCodes.add(code); continue; }
      if (INTERNATIONAL_TAXONOMY.test(categoryName)) {
        if (/top.?up|recharge|airtime|reload|prepaid/i.test(categoryName)) for (const code of codes) internationalCodes.add(code);
        continue;
      }
      if (NOT_AIRTIME_TAXONOMY.test(categoryName)) continue;
      if (RECHARGE_TAXONOMY.test(taxonomy)) for (const code of codes) rechargeCodes.add(code);
    }
  }

  // By name in the product's text, or by an explicit country field. A bare
  // two-letter code is never searched for in text: "ID" is inside "IDT1".
  const wantedName = norm(countryName);
  const wantedCode = String(country || '').toUpperCase();
  const mentionsCountry = (p) => {
    if ([p.country, p.country_code].some((value) => String(value || '').toUpperCase() === wantedCode)) return true;
    return wantedName.length >= 3 && norm([p.name, p.label, p.description, p.note].join(' ')).includes(wantedName);
  };
  // Malaysia sells from the domestic categories; anywhere else from the
  // international one, narrowed to products naming that country when any do.
  let scope = rechargeCodes;
  if (!domestic) {
    const matching = [...internationalCodes].filter((code) => products[code] && mentionsCountry(products[code]));
    scope = new Set(matching.length ? matching : internationalCodes);
  }
  const hasTaxonomy = scope.size > 0;

  const knownNames = staticOperators.map(norm).filter(Boolean);
  const countries = new Set(countryNames.map(norm).filter(Boolean));
  const isDataPlan = (p) => Array.isArray(p && p.fields) && p.fields.some((field) => field && field.type === 'select' && field.data_source);
  const seen = new Set();
  const out = [];
  for (const [key, p] of Object.entries(products)) {
    if (!p || p.is_active === false) continue;
    const code = String(p.code || key);
    if (!code || seen.has(code.toLowerCase())) continue;
    const name = String(p.name || p.label || code).trim();
    if (!name) continue;
    if (String(p.processing_time || '').toLowerCase() === 'pin') continue;
    const searchable = [name, p.description, p.label, p.note, p.processing_time, code].map((value) => String(value || '')).join(' ');
    if (billCodes.has(code) || BILL_TEXT.test(searchable)) continue;
    let include;
    if (hasTaxonomy) {
      // Category membership is authoritative. A product named after a country
      // is legitimate inside the international category - that is how it is
      // sold - and is only dropped as a stray label anywhere else.
      include = scope.has(code) && (!domestic || !countries.has(norm(name)));
    } else {
      // No usable taxonomy: fall back to names, still requiring a number field.
      if (countries.has(norm(name)) || isDataPlan(p)) continue;
      const fields = Array.isArray(p.fields) ? p.fields : [];
      const hasAccountField = fields.some((field) => field && (
        field.role === 'account' || /phone|mobile|msisdn|accountnumber/i.test(String(field.id || '') + ' ' + String(field.label || ''))
      ));
      const normalizedName = norm(name);
      const normalizedCode = norm(code);
      const matchesKnownOperator = knownNames.some((known) =>
        normalizedName.includes(known) || known.includes(normalizedName) || normalizedCode.includes(known));
      include = hasAccountField && (RECHARGE_TAXONOMY.test(searchable) || matchesKnownOperator || /mobile|telecom|telco|cellular/i.test(searchable));
    }
    if (!include) continue;
    seen.add(code.toLowerCase());
    out.push({ ...p, code, name });
  }
  return out;
}

// Short operator names IIMMPACT spells differently in product names.
const OPERATOR_ALIASES = {
  hotlink: ['hotlink'], tunetalk: ['tunetalk', 'tune talk'], yes: ['yes'], xox: ['xox', 'onexox'],
  celcom: ['celcom', 'celcomdigi'], digi: ['digi', 'celcomdigi'], umobile: ['umobile', 'u mobile'],
};
const DATA_CATEGORY = /^(mobile )?(data|internet)( plans?| packages?| bundles?)?$/;

/**
 * Data operators IIMMPACT sells that the built-in list has no entry for.
 *
 * The Internet step offers a fixed operator list per country, and a "Mobile
 * Data" product for any operator not on it (Unifi Mobile, say) could not be
 * reached at all. The built-in names are kept - they carry logos and number
 * detection - and anything IIMMPACT adds beyond them is appended under the
 * product's own name, which the server's data-plan lookup matches exactly.
 */
export function extraDataOperators(catalog, staticOperators = []) {
  const products = catalog && catalog.products && typeof catalog.products === 'object' ? catalog.products : {};
  const groups = Array.isArray(catalog && catalog.tree && catalog.tree.groups) ? catalog.tree.groups : [];
  const known = staticOperators.flatMap((name) => OPERATOR_ALIASES[norm(name)] || [name]).map(norm).filter(Boolean);
  const out = [];
  for (const group of groups) {
    for (const category of (Array.isArray(group && group.categories) ? group.categories : [])) {
      const label = String((category && category.name) || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!DATA_CATEGORY.test(label)) continue;
      for (const code of (Array.isArray(category.product_codes) ? category.product_codes : [])) {
        const p = products[String(code)];
        if (!p || p.is_active === false) continue;
        const name = String(p.name || p.label || code).trim();
        const n = norm(name);
        if (!n || known.some((k) => n.includes(k)) || out.includes(name)) continue;
        out.push(name);
      }
    }
  }
  return out;
}
