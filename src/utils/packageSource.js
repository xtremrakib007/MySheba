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
// `perNumber` of null means "not asked/offered here". When
// `requirePerNumber` is true, null is intentionally NOT treated as an
// invitation to show invented/static packages.

export function resolvePackageSource({
  country,
  perNumber,
  perNumberError,
  successTopUp,
  builtIn,
  requirePerNumber = false,
}) {
  if (perNumberError) {
    return { packages: [], blocked: true, emptyForNumber: false, perNumber: true };
  }
  if (Array.isArray(perNumber)) {
    return {
      packages: perNumber,
      blocked: false,
      emptyForNumber: perNumber.length === 0,
      perNumber: true,
    };
  }
  if (requirePerNumber) {
    return { packages: [], blocked: true, emptyForNumber: false, perNumber: true };
  }
  if (String(country || '').toUpperCase() === 'BD') {
    return { packages: successTopUp || [], blocked: false, emptyForNumber: false, perNumber: false };
  }
  return { packages: builtIn || [], blocked: false, emptyForNumber: false, perNumber: false };
}
