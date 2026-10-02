// Which country a user signed up from.
//
// There is no `country` field on a user: registration stores the dial code they
// picked, as `phoneCountryCode` (see functions/customerRegistration.js), and the
// wallet currency is derived from it. So the country is derived too.
//
// A dial code is not a country. +1 covers the US, Canada and most of the
// Caribbean; +7 is Russia and Kazakhstan; +39 is Italy and the Vatican. Picking
// the first match would tell an admin a Canadian customer is American, which is
// worse than saying nothing - so an ambiguous code resolves to no country and
// the code itself is shown instead. Every market this app actually serves
// (MY +60, BD +880, SG +65, ID +62, IN +91, PH +63) is unambiguous.
import { phoneCountries } from '../data/phoneCountries';

function normalise(dial) {
  const digits = String(dial || '').replace(/[^0-9]/g, '');
  return digits ? `+${digits}` : '';
}

// dial -> the single country using it, or null when more than one does.
const BY_DIAL = (() => {
  const counts = new Map();
  for (const country of phoneCountries) {
    const key = normalise(country.dial);
    if (!key) continue;
    counts.set(key, (counts.get(key) || []).concat(country));
  }
  const unique = new Map();
  for (const [key, list] of counts) unique.set(key, list.length === 1 ? list[0] : null);
  return unique;
})();

/** The country for a dial code, or null when the code is shared or unknown. */
export function countryFromDial(dial) {
  const key = normalise(dial);
  if (!key) return null;
  return BY_DIAL.get(key) || null;
}

/**
 * What to show for a user's country.
 *
 * Returns the flag and name when the dial code names exactly one country, the
 * bare dial code when several share it, and an em dash when the user has none
 * recorded - accounts created before phoneCountryCode was stored.
 */
export function countryLabel(user) {
  const dial = normalise(user && (user.phoneCountryCode || user.dialCode));
  if (!dial) return '—';
  const country = countryFromDial(dial);
  return country ? `${country.flag} ${country.name}` : dial;
}

/** The ISO code, for filtering and for country-scoped permissions. */
export function countryCodeOf(user) {
  const country = countryFromDial(user && (user.phoneCountryCode || user.dialCode));
  return country ? country.code : '';
}
