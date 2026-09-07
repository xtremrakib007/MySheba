import { internetPackagesByOperator, internetPackages } from '../data/countries';

// Combines the hardcoded base package list for an operator (see
// internetPackagesByOperator in data/countries.js) with whatever Admin >
// Pricing has changed for it in Firestore (internetPricingService.js), into
// one flat, ready-to-render list. Both the Admin pricing tab and the
// customer-facing InternetSteps package picker call this, so an operator
// always shows the same packages in both places.
//
// Every item gets a stable `id`:
//   - "base:<index>"  - a built-in package, index into internetPackagesByOperator[operator]
//   - the Firestore key - a package the admin added (isCustom: true)
// Edits/removals from the admin UI are keyed by that id, so renaming a
// package doesn't break its link back to the record being edited.
export function getMergedPackages(operator, pricingDoc) {
  const base = internetPackagesByOperator[operator] || internetPackages;
  const d = pricingDoc || {};
  const overrides = d.overrides || {};
  const removedBase = d.removedBase || {};
  const custom = d.custom || {};
  const legacyPrices = d.prices || {}; // pre-existing price-only overrides

  const baseItems = base
    .map((p, i) => {
      if (removedBase[i]) return null;
      const o = overrides[i] || {};
      const legacyPrice = legacyPrices[p.name];
      return {
        id: `base:${i}`,
        baseIndex: i,
        name: o.name != null ? o.name : p.name,
        data: o.data != null ? o.data : p.data,
        valid: o.valid != null ? o.valid : p.valid,
        price: o.price != null ? o.price : (legacyPrice != null ? legacyPrice : p.price),
        isCustom: false,
      };
    })
    .filter(Boolean);

  const customItems = Object.keys(custom).map((id) => ({
    id,
    name: custom[id].name,
    data: custom[id].data,
    valid: custom[id].valid,
    price: custom[id].price,
    isCustom: true,
  }));

  return [...baseItems, ...customItems];
}
