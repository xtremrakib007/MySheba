// The service catalogue: which countries and operators the app offers, as a
// superadmin's edits ON TOP of what the app ships with.
//
// WHAT THIS IS NOT. It does not replace src/data/countries.js. That file stays
// the default, and it stays the source for everything OUTSIDE a service
// picker - the signup dial codes, KYC, ad targeting, salary, the language
// list. Those read `countries` directly and must keep doing so: a market
// turned off for selling is not a country whose existing customers should stop
// being able to sign in, and 'remove India' must never mean 'nobody with a
// +91 number can log in'.
//
// So the overrides apply at exactly three pickers - Recharge, Internet and
// Offer Packs - plus the Recharge PIN brand list. That is the blast radius,
// on purpose.
//
// THE SHAPE, one pattern for all three:
//
//   countries: { disabled: ['IN'],          added: [{code,name,flag,dial,curr}] }
//   operators: { disabled: { MY: ['XOX'] }, added: { MY: ['New Telco'] } }
//
// PACKAGES ARE DELIBERATELY NOT HERE. Admin > Pricing has edited them since
// long before this file existed: utils/internetPackages.getMergedPackages
// combines the shipped list with that screen's `custom`, `overrides` and
// `removedBase`, and that is what the customer's picker renders. A second
// place to add and remove packages would be two write paths to one idea, and
// the loser would be whichever the next person does not know about.
//
// What WAS missing is that Pricing could only ever list the operators the app
// ships with, so an operator added here had nowhere to get packages. Its list
// is fed from operatorsForCountry instead.
//
// Disabling is reversible and additive - the shipped entry is still there, so
// turning it back on restores it exactly. Nothing is ever deleted from the
// defaults, which is why a bad edit cannot lose a market.
//
// ORDERS STILL NEED A PROVIDER. Adding an operator here puts it in front of
// customers; it does not teach any API provider how to top it up. That
// mapping is operatorProductCodes in API Provider Management, and an operator
// with no mapping takes orders that fail. providerCoverage below is what the
// editing screen uses to say so before it happens, rather than after.

const MAX_NAME = 60;
const MAX_ADDED_PER_KEY = 60;

const str = (v) => String(v == null ? '' : v).trim();

/** A list of trimmed, distinct, length-capped names. */
function nameList(raw, cap = MAX_ADDED_PER_KEY) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const name = str(entry);
    if (!name || name.length > MAX_NAME || out.includes(name)) continue;
    if (out.length >= cap) break;
    out.push(name);
  }
  return out;
}

/** { key: [names] }, cleaned. */
function nameListMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = str(key);
    if (!id || id.length > MAX_NAME) continue;
    const list = nameList(value);
    if (list.length) out[id] = list;
  }
  return out;
}

/**
 * A country a superadmin added.
 *
 * `code` is upper-cased and must be two letters, because every consumer keys
 * on an ISO code and a three-letter or lower-case one silently matches
 * nothing. `dial` keeps its '+' - the pickers show it.
 */
export function cleanCountry(raw) {
  const code = str(raw && raw.code).toUpperCase();
  const name = str(raw && raw.name);
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (!name || name.length > MAX_NAME) return null;
  const dial = str(raw && raw.dial).replace(/[^\d+]/g, '');
  const curr = str(raw && raw.curr).toUpperCase().slice(0, 3);
  return {
    code,
    name,
    flag: str(raw && raw.flag).slice(0, 8),
    dial: dial ? (dial.startsWith('+') ? dial : `+${dial}`) : '',
    curr,
  };
}

/** Everything the stored document is allowed to say. */
export function cleanCatalogue(data) {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const countries = d.countries && typeof d.countries === 'object' ? d.countries : {};
  const operators = d.operators && typeof d.operators === 'object' ? d.operators : {};

  const addedCountries = [];
  const seen = new Set();
  for (const entry of Array.isArray(countries.added) ? countries.added : []) {
    const clean = cleanCountry(entry);
    if (!clean || seen.has(clean.code)) continue;
    if (addedCountries.length >= MAX_ADDED_PER_KEY) break;
    seen.add(clean.code);
    addedCountries.push(clean);
  }

  return {
    countries: {
      disabled: nameList(countries.disabled).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
      added: addedCountries,
    },
    operators: { disabled: nameListMap(operators.disabled), added: nameListMap(operators.added) },
  };
}

/**
 * The countries a SERVICE picker offers: the shipped list plus any added, less
 * any disabled.
 *
 * Added entries go after the shipped ones rather than being sorted in, so the
 * markets that have always been first stay first and a new one does not
 * reshuffle a grid people know.
 */
export function serviceCountries(defaults, catalogue) {
  const c = (catalogue && catalogue.countries) || {};
  const off = new Set(c.disabled || []);
  const base = (Array.isArray(defaults) ? defaults : []).filter((x) => !off.has(x.code));
  const have = new Set(base.map((x) => x.code));
  const extra = (c.added || []).filter((x) => !have.has(x.code) && !off.has(x.code));
  return [...base, ...extra];
}

/** The operators one country's pickers offer. */
export function operatorsForCountry(defaults, catalogue, country) {
  const code = str(country).toUpperCase();
  const o = (catalogue && catalogue.operators) || {};
  const off = new Set((o.disabled && o.disabled[code]) || []);
  const base = ((defaults && defaults[code]) || []).filter((name) => !off.has(name));
  const extra = ((o.added && o.added[code]) || []).filter((name) => !off.has(name) && !base.includes(name));
  return [...base, ...extra];
}

/**
 * Which API providers could actually fulfil an order for this operator.
 *
 * Reads the operator → product code maps that API Provider Management already
 * keeps (operatorProductCodes, and catalogOperatorCodes for listings). Used by
 * the editing screen to warn that an operator customers can pick is one no
 * provider knows how to top up - the orders fail, and they fail after the
 * money has been taken from the customer's wallet.
 *
 * Case-insensitive, because the maps are typed by hand.
 */
export function providerCoverage(providers, operator) {
  const id = str(operator).toLowerCase();
  const out = { fulfil: 0, catalogue: 0 };
  if (!id) return out;
  for (const provider of Array.isArray(providers) ? providers : []) {
    if (!provider || provider.active === false) continue;
    const fulfilMap = provider.operatorProductCodes;
    if (fulfilMap && typeof fulfilMap === 'object') {
      for (const key of Object.keys(fulfilMap)) if (str(key).toLowerCase() === id) out.fulfil += 1;
    }
    const catMap = provider.catalogOperatorCodes;
    if (catMap && typeof catMap === 'object') {
      for (const key of Object.keys(catMap)) if (str(key).toLowerCase() === id) out.catalogue += 1;
    }
  }
  return out;
}
