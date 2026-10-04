// Which package list a customer is actually offered, and whether they may be
// offered one at all.
//
// Three lists can feed the same picker and they are not interchangeable:
//
//   perNumber    plans the provider resolved for THIS phone number.
//   successTopUp Bangladesh's catalogue, per operator.
//   builtIn      the hardcoded list plus Admin > Pricing, for everything else.
//
// The rule that matters is the failure case. When a per-number lookup fails,
// falling back to the built-in list looks helpful and is not: that list is not
// what this number was quoted from, the server will refuse the order against it
// anyway once a per-number catalogue is configured, and in between the customer
// is shown prices for plans they cannot buy. So a failure blocks the picker
// rather than substituting a list.
//
// `perNumber` of null means "not offered here" - no such provider for this
// country and operator - and is the ordinary case that keeps every existing
// operator working. An empty ARRAY is a different answer: the provider was
// asked about this number and had nothing.

/**
 * @param {object} args
 * @param {string} args.country
 * @param {Array|null} args.perNumber     plans for this number, or null when not offered.
 * @param {string} args.perNumberError    a failed per-number lookup.
 * @param {Array} args.successTopUp       the Bangladesh catalogue.
 * @param {Array} args.builtIn            the built-in/admin-priced list.
 * @returns {{ packages: Array, blocked: boolean, emptyForNumber: boolean, perNumber: boolean }}
 */
export function resolvePackageSource({ country, perNumber, perNumberError, successTopUp, builtIn }) {
  if (perNumberError) return { packages: [], blocked: true, emptyForNumber: false, perNumber: true };
  if (Array.isArray(perNumber)) {
    return { packages: perNumber, blocked: false, emptyForNumber: perNumber.length === 0, perNumber: true };
  }
  if (String(country || '').toUpperCase() === 'BD') {
    return { packages: successTopUp || [], blocked: false, emptyForNumber: false, perNumber: false };
  }
  return { packages: builtIn || [], blocked: false, emptyForNumber: false, perNumber: false };
}
