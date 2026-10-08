'use strict';

// Which countries a provider serves.
//
// It used to be one: `country`, either a code or 'ALL'. One API key often
// covers several though - an iimmpact record serving Malaysia and Singapore
// but not Bangladesh - and expressing that meant duplicating the whole record,
// credentials and all, once per country.
//
// So a provider carries a LIST, exactly as it already carries a list of
// features: `countries` is the list and `country` is the first of them, kept
// in step so every reader written before this goes on working unchanged
// against a record saved after it.
//
// 'ALL' is exclusive. It is not a country, it is "every country", so a list of
// ALL and Malaysia is not a provider that serves Malaysia twice - it would be
// both the specific provider for Malaysia and the global fallback at once, and
// the rule that a country-specific provider beats a global one has nothing to
// say about a provider that is both. Choosing ALL means ALL.

const GLOBAL = 'ALL';

/** A provider's countries, normalised. Never empty: no list means ALL. */
function providerCountries(provider) {
  const raw = provider && Array.isArray(provider.countries) && provider.countries.length
    ? provider.countries
    : [provider && provider.country];
  const out = [];
  for (const entry of raw) {
    const code = String(entry || '').trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  if (!out.length) return [GLOBAL];
  return out.includes(GLOBAL) ? [GLOBAL] : out;
}

/** Serves every country, so it is the fallback rather than anyone's first choice. */
function isGlobal(provider) {
  return providerCountries(provider).includes(GLOBAL);
}

/** Named this country outright, which is what beats the global fallback. */
function isSpecificFor(provider, country) {
  const code = String(country || '').trim().toUpperCase();
  if (!code || code === GLOBAL) return false;
  const excluded = Array.isArray(provider?.excludedCountries)
    ? provider.excludedCountries.map((x) => String(x || '').trim().toUpperCase())
    : [];
  if (excluded.includes(code)) return false;
  const countries = providerCountries(provider);
  // The GLOBAL half is belt-and-braces: providerCountries already drops every
  // other country once ALL is present, so a list cannot hold both. It stays
  // because this function is where "specific" is defined, and if that
  // normalisation is ever relaxed this is the line that must not be relaxed
  // with it - a provider that is specific AND global breaks the rule that one
  // beats the other.
  return !countries.includes(GLOBAL) && countries.includes(code);
}

/** Would reach this country at all, by name or by serving all of them. */
function servesCountry(provider, country) {
  const code = String(country || '').trim().toUpperCase();
  const excluded = Array.isArray(provider?.excludedCountries)
    ? provider.excludedCountries.map((x) => String(x || '').trim().toUpperCase())
    : [];
  if (excluded.includes(code)) return false;
  return isGlobal(provider) || isSpecificFor(provider, code);
}

/**
 * A submitted list, cleaned, for saving.
 *
 * Throws on a code the app does not serve rather than dropping it: a country
 * that silently vanished would leave a provider that quietly stops taking
 * orders from it, which looks like the provider being down.
 */
function normaliseCountries(input, { allowed, onInvalid } = {}) {
  const list = Array.isArray(input)
    ? input
    : (typeof input === 'string' ? input.split(/[\s,]+/) : []);
  const out = [];
  for (const entry of list) {
    const code = String(entry || '').trim().toUpperCase();
    if (!code) continue;
    if (allowed && !allowed.includes(code)) {
      if (onInvalid) onInvalid(code);
      continue;
    }
    if (!out.includes(code)) out.push(code);
  }
  if (!out.length) return [GLOBAL];
  return out.includes(GLOBAL) ? [GLOBAL] : out;
}

module.exports = { GLOBAL, providerCountries, isGlobal, isSpecificFor, servesCountry, normaliseCountries };
