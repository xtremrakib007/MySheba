// Which countries a provider serves, for the screens.
//
// The same two questions the backend asks, asked the same way, because the
// admin screen's count of "providers serving Malaysia" has to agree with what
// a Malaysian order would actually find. The rules are mirrored from
// functions/providerReach.js and scripts/test-provider-reach.js holds the two
// implementations against the same table of cases so they cannot drift.
//
// 'ALL' is exclusive: it means every country, so a list of ALL and Malaysia is
// not a provider that serves Malaysia twice - it would be both the specific
// provider and the global fallback, and the rule that a specific provider wins
// has nothing to say about one that is both.

export const GLOBAL = 'ALL';

/** A provider's countries, normalised. Never empty: no list means ALL. */
export function providerCountries(provider) {
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

export function isGlobal(provider) {
  return providerCountries(provider).includes(GLOBAL);
}

export function isSpecificFor(provider, country) {
  const code = String(country || '').trim().toUpperCase();
  if (!code || code === GLOBAL) return false;
  const countries = providerCountries(provider);
  // The GLOBAL half is belt-and-braces: providerCountries already drops every
  // other country once ALL is present, so a list cannot hold both. It stays
  // because this function is where "specific" is defined, and if that
  // normalisation is ever relaxed this is the line that must not be relaxed
  // with it - a provider that is specific AND global breaks the rule that one
  // beats the other.
  return !countries.includes(GLOBAL) && countries.includes(code);
}

export function servesCountry(provider, country) {
  return isGlobal(provider) || isSpecificFor(provider, country);
}

/**
 * Toggling one country in the picker.
 *
 * Choosing ALL clears everything else, and choosing a country clears ALL -
 * otherwise a provider ends up both specific and global. The last country
 * cannot be unpicked into nothing; it falls back to ALL, which is what an
 * unset provider has always meant.
 */
export function toggleCountry(current, code) {
  const chosen = String(code || '').trim().toUpperCase();
  if (!chosen) return providerCountries({ countries: current });
  if (chosen === GLOBAL) return [GLOBAL];
  const list = providerCountries({ countries: current }).filter((c) => c !== GLOBAL);
  const next = list.includes(chosen) ? list.filter((c) => c !== chosen) : [...list, chosen];
  return next.length ? next : [GLOBAL];
}
