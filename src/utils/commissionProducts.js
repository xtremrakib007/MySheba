// Every catalogue product, grouped the way IIMMPACT files them (the tree's
// group and category, e.g. "Mobile · Mobile Prepaid"), for the superadmin's
// Commission by product list. Inactive products are left out unless they
// already carry a commission; a product in no category goes under Other.
// The admin web keeps the same rules in admin-web/src/services/catalogMirror.ts.

export function commissionProductGroups(catalog, savedCodes = [], filter = '') {
  const products = catalog?.products || {};
  const byCode = new Map();
  for (const p of Object.values(products)) {
    if (p && p.code) byCode.set(String(p.code), p);
  }
  const saved = new Set(savedCodes.map(String));
  const placed = new Set();
  const groups = [];
  const q = String(filter || '').trim().toLowerCase();
  const matches = (item, label) => !q || [item.name, item.code, label].some((v) => String(v || '').toLowerCase().includes(q));
  const add = (label, codes) => {
    const items = [];
    for (const raw of codes) {
      const code = String(raw);
      const p = byCode.get(code);
      if (placed.has(code) || (!p && !saved.has(code))) continue;
      if (p && p.is_active === false && !saved.has(code)) continue;
      const item = { code, name: String(p?.name || code) };
      placed.add(code);
      if (matches(item, label)) items.push(item);
    }
    if (items.length) groups.push({ label, items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  };
  for (const g of catalog?.tree?.groups || []) {
    for (const c of g?.categories || []) {
      add([g?.name, c?.name].filter(Boolean).join(' · ') || 'Other', Array.isArray(c?.product_codes) ? c.product_codes : []);
    }
  }
  add('Other', [...byCode.keys()]);
  add('Not in catalogue', [...saved]);
  return groups;
}
