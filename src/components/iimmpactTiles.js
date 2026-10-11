// The live IIMMPACT catalogue as native MySheba tiles.
//
// IIMMPACT publishes its catalogue as groups ("Mobile", "Bills", "Vouchers",
// "Games") holding categories ("Mobile Prepaid", "Water Bills", "Food &
// Beverage"), each listing the product codes it sells. Every category with at
// least one active product becomes one tile in the same grid as the rest of
// the app, opening the catalogue-driven product form.
//
// Some of those categories are things MySheba already has a tile for. Drawing
// "Mobile Prepaid" beside "Mobile Recharge" is the same destination twice, so
// a category a native tile already sells is MERGED into it: no second tile, and
// the native flow - which reads the same catalogue - is where it opens.
//
// The hand-made voucher tiles (Coffee & Tea, Transport, ...) were regex views
// over these same products, written before the catalogue had categories of its
// own. Each is retired once the live catalogue carries the category it
// approximated, and stays as a fallback while it does not.
//
// Nothing here touches React or the network: it is data in, tiles out, so the
// merge can be computed in a test.

export const IIMMPACT_CATALOG_CACHE_KEY = '@mysheba/iimmpact-catalog/MY/v1';

/** A category name as a comparable phrase: "Food & Beverage" -> "food and beverage". */
export function categoryPhrase(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The tile key a category is drawn under. Stable across catalogue refreshes. */
export function catalogTileKey(name) {
  return 'iimmpact_' + (categoryPhrase(name).replace(/ /g, '_') || 'category');
}

// Native tiles that already sell a catalogue category, matched against the
// category's phrase. Anchored on purpose: "Mobile Postpaid" is a bill, not a
// prepaid reload, and must not be folded into Mobile Recharge.
export const NATIVE_CATEGORY_MERGES = [
  { tileKey: 'recharge', pattern: /^(mobile )?(prepaid|airtime|reload|top ?up)( reload| top ?up)?$/ },
  { tileKey: 'internet', pattern: /^(mobile )?(data|internet)( plans?| packages?| bundles?)?$/ },
  { tileKey: 'rechargePin', pattern: /^(mobile |telco )?pins?( vouchers?)?$/ },
];

// Hand-made PIN tiles, and the live category phrase that replaces each.
export const SUPERSEDED_PIN_TILES = {
  pinCategoryMobile: /^(mobile |telco )?pins?( vouchers?)?$/,
  pinCategoryCoffee: /\b(coffee|tea|food|beverage|dining)\b/,
  pinCategoryWellness: /\b(wellness|health|beauty)\b/,
  pinCategoryTransport: /\btransport(ation)?\b/,
  pinCategoryApple: /\b(apple|itunes|app stores?)\b/,
  pinCategoryShopping: /\b(shopping|retail)\b/,
  pinCategoryGrocery: /\bgrocer(y|ies)\b/,
  pinCategoryOther: /\b(digital vouchers?|gift cards?)\b/,
};

// Drawing used when IIMMPACT has no logo for a category, by its group.
function fallbackArt(group, name) {
  const text = `${categoryPhrase(group)} ${categoryPhrase(name)}`;
  if (/\b(game|games|gaming|console)\b/.test(text)) return 'entertainment';
  if (/\b(wallet|wallets|ewallet)\b/.test(text)) return 'walletTransfer';
  if (/\bbills?\b|\b(water|electricity|broadband|council|loan|postpaid)\b/.test(text)) return 'billpayment';
  if (/\b(mobile|idd|topup|top up)\b/.test(text)) return 'recharge';
  return 'rechargePin';
}

/**
 * Every category with at least one active product, once each.
 *
 * A category name repeated across groups is one category: its product codes
 * are combined rather than drawn as two tiles with the same label.
 */
export function catalogCategories(catalog) {
  const products = catalog && typeof catalog.products === 'object' && catalog.products ? catalog.products : {};
  const groups = Array.isArray(catalog?.tree?.groups) ? catalog.tree.groups : [];
  const byPhrase = new Map();
  for (const group of groups) {
    for (const category of Array.isArray(group?.categories) ? group.categories : []) {
      const name = String(category?.name || '').trim();
      const phrase = categoryPhrase(name);
      if (!phrase) continue;
      const codes = (Array.isArray(category?.product_codes) ? category.product_codes : []).map(String);
      const active = codes.filter((code) => {
        const product = products[code];
        return product && product.is_active !== false;
      });
      if (!byPhrase.has(phrase)) {
        byPhrase.set(phrase, {
          id: String(category?.id || phrase),
          name,
          phrase,
          group: String(group?.name || ''),
          imageUrl: '',
          codes: [],
        });
      }
      const entry = byPhrase.get(phrase);
      for (const code of active) if (!entry.codes.includes(code)) entry.codes.push(code);
      if (!entry.imageUrl) {
        entry.imageUrl = String(category?.icon_url || group?.icon_url || products[active[0]]?.image_url || '');
      }
    }
  }
  return [...byPhrase.values()].filter((entry) => entry.codes.length > 0);
}

/** The native tile key a category merges into, or '' when it has none. */
export function nativeTileFor(category, nativeKeys) {
  const phrase = categoryPhrase(category?.name ?? category);
  const keys = nativeKeys instanceof Set ? nativeKeys : new Set(nativeKeys || []);
  const rule = NATIVE_CATEGORY_MERGES.find((merge) => merge.pattern.test(phrase));
  return rule && keys.has(rule.tileKey) ? rule.tileKey : '';
}

/** One tile per catalogue category that no native tile already sells. */
export function catalogTiles(catalog, nativeKeys = []) {
  return catalogCategories(catalog)
    .filter((category) => !nativeTileFor(category, nativeKeys))
    .map((category) => ({
      key: catalogTileKey(category.name),
      name: category.name,
      icon: 'more',
      art: category.imageUrl ? undefined : fallbackArt(category.group, category.name),
      imageUrl: category.imageUrl,
      kind: 'iimmpactProducts',
      iimmpactCategory: category.name,
      cat: 'iimmpact',
      count: category.codes.length,
    }));
}

/**
 * A grid's tiles with the live catalogue merged in.
 *
 * `nativeKeys` is every tile this role has - home screen included - so a
 * category is merged into Mobile Recharge even on a screen that does not draw
 * Mobile Recharge itself. Without a catalogue the tiles come back unchanged,
 * hand-made voucher tiles and all, so an unreachable provider never empties
 * the grid.
 */
export function mergeCatalogTiles(tiles, catalog, nativeKeys) {
  const list = Array.isArray(tiles) ? tiles : [];
  const categories = catalogCategories(catalog);
  if (!categories.length) return list;
  const native = new Set(nativeKeys || list.map((tile) => tile.key));
  const superseded = (tile) => {
    const pattern = SUPERSEDED_PIN_TILES[tile?.key];
    return !!pattern && categories.some((category) => pattern.test(category.phrase));
  };
  const kept = list.filter((tile) => !superseded(tile));
  const taken = new Set(kept.map((tile) => tile.key));
  const added = catalogTiles(catalog, native).filter((tile) => !taken.has(tile.key));
  return [...kept, ...added];
}
