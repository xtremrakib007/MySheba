// The PIN Generator's categories, and which one each IIMMPACT voucher is in.
//
// Shared by the PIN screen and by the native service grid: the grid draws one
// tile per category that has products, and the screen opens on that category,
// so both must sort a product into the same place. They used to be two copies
// of a list in one screen, which the grid could not see.
//
// `tileKey`, `art` and `emoji` are how the category is drawn as a tile.
export const PIN_CATEGORIES = [
  { id: 'mobile', title: 'Mobile Operator PIN', tileKey: 'pinCategoryMobile', art: 'recharge', emoji: '\uD83D\uDCF1' },
  { id: 'coffee', title: 'Coffee & Tea', tileKey: 'pinCategoryCoffee', art: 'coffeeVoucher', emoji: '\u2615' },
  { id: 'wellness', title: 'Health & Wellness', tileKey: 'pinCategoryWellness', art: 'wellnessVoucher', emoji: '\uD83D\uDC86' },
  { id: 'transport', title: 'Transport', tileKey: 'pinCategoryTransport', art: 'bus', emoji: '\uD83D\uDE86' },
  { id: 'apple', title: 'Apple & iTunes', tileKey: 'pinCategoryApple', art: 'appleVoucher', emoji: '\uD83C\uDF4E' },
  { id: 'shopping', title: 'Shopping PIN', tileKey: 'pinCategoryShopping', art: 'shoppingVoucher', emoji: '\uD83D\uDECD\uFE0F' },
  { id: 'grocery', title: 'Grocery & GrabMart', tileKey: 'pinCategoryGrocery', art: 'groceryVoucher', emoji: '\uD83D\uDED2' },
  { id: 'food', title: 'Food & Delivery', tileKey: 'pinCategoryFood', art: '', emoji: '\uD83C\uDF54' },
  { id: 'gaming', title: 'Gaming & Entertainment', tileKey: 'pinCategoryGaming', art: 'entertainment', emoji: '\uD83C\uDFAE' },
  { id: 'fuel', title: 'Fuel', tileKey: 'pinCategoryFuel', art: '', emoji: '\u26FD' },
  { id: 'other', title: 'Other PIN & Vouchers', tileKey: 'pinCategoryOther', art: 'rechargePin', emoji: '\uD83C\uDF81' },
];

export const FEATURED_PIN_ORDER = [
  /digi.*internet.*pin|internet.*pin.*digi/i,
  /digipin|digi.*pin/i,
  /hello.*sim.*pin|hello.*pin/i,
];

/** A product fulfilled as a PIN or voucher code rather than a live top-up. */
export function isVoucherProduct(product) {
  if (!product || product.is_active === false || !product.code) return false;
  const text = [
    product.name, product.description, product.note, product.category,
    product.subcategory, product.product_group, product.label,
  ].map((value) => String(value || '')).join(' ');
  return String(product.processing_time || '').toLowerCase() === 'pin'
    || /voucher|gift card|giftcard|digital code|gaming code/i.test(text);
}

// Classify using specific non-telecom categories first. IIMMPACT may attach
// a generic "mobile PIN" product-group label to unrelated voucher products,
// so that label alone must never put a shopping/food/transport product in
// Mobile Operator PIN. Only a recognizable Malaysian telco product qualifies.
export function classifyPinProduct(product) {
  const name = String(product?.name || '');
  const taxonomy = [product?.category, product?.subcategory, product?.product_group, product?.label]
    .map((value) => String(value || '')).join(' ');
  const text = [name, product?.description, product?.note, taxonomy]
    .map((value) => String(value || '')).join(' ');
  const category = (id) => PIN_CATEGORIES.find((item) => item.id === id);

  const exclusions = [
    // Short words are matched whole: "tea" is inside "Steam", "bus" inside
    // "business" and "spa" inside "space", and each filed a product under the
    // wrong category.
    ['transport', /grab|transport|\bride\b|taxi|\bbus\b|\btrain\b|rapid|myrapid|touch.?n.?go|\btng\b|travel pass/i],
    ['coffee', /coffee|\bcafe\b|\btea\b|tealive|starbucks|zuss|oldtown|kenangan/i],
    ['grocery', /grocery|grabmart|grab mart|supermarket|pandamart/i],
    ['shopping', /shopping|retail|shopee|lazada|mall|fashion|e-commerce|ecommerce/i],
    ['wellness', /health|wellness|beauty|guardian|watsons|pharmacy|fitness|\bspa\b/i],
    ['food', /food|restaurant|meal|delivery|dining|foodpanda/i],
    ['apple', /apple|itunes|app store/i],
    ['gaming', /game|gaming|playstation|xbox|steam|roblox|pubg|mobile legends|netflix|spotify|movie|music|stream/i],
  ];
  // The product's own name decides first. Description text is free prose,
  // and loose words in it ("instead", "business", "provider") used to match
  // tea, bus and ride and file a telco PIN under coffee or transport.
  for (const [id, pattern] of exclusions) {
    if (pattern.test(name)) return category(id);
  }

  const operatorPattern = /celcomdigi|celcom|digi(?!tal)|hotlink|maxis|u.?mobile|xox|tune.?talk|unifi|\byes\b|hello\s?sim|red.?one|altel/i;
  const explicitTelco = /mobile operator|mobile top.?up|telco|telecom|sim card|airtime|prepaid reload|internet pin/i.test(`${name} ${taxonomy}`);
  // The operator must be named by the product or by its own taxonomy - never
  // only by free description text, which mentions telcos in passing.
  if (operatorPattern.test(name) || (explicitTelco && operatorPattern.test(taxonomy))) return category('mobile');
  for (const [id, pattern] of exclusions) {
    if (pattern.test(text)) return category(id);
  }
  if (/gift card|voucher|digital code|giftcard/i.test(text)) return category('shopping');
  return category('other');
}

/**
 * Every voucher in a catalogue, by category, in PIN_CATEGORIES order. Only
 * categories with products are returned, so an empty one is never a tile.
 */
// IIMMPACT's own category, when it names one, decides the PIN category: it is
// the provider's statement of what a product is. Guessing from the product
// name filed one of the thirteen "Mobile Pin" products elsewhere and had no
// home at all for "Fuel". The name is consulted only to split a provider
// category the PIN grid divides further (Food & Beverage into coffee and
// food), and for products IIMMPACT files under no voucher category.
const TREE_RULES = [
  [/^(mobile |telco )?pins?( vouchers?)?$/, 'mobile'],
  [/\b(fuel|petrol|petronas|shell|caltex|bhp)\b/, 'fuel'],
  [/\btransport(ation)?\b/, 'transport'],
  [/\bgrocer(y|ies)\b/, 'grocery'],
  [/\b(wellness|beauty|health)\b/, 'wellness'],
  [/\b(retail|shopping)\b/, 'shopping'],
  [/\b(food|beverage|dining|restaurant|f and b)\b/, 'food-or-coffee'],
  [/\b(app stores?|apple|itunes)\b/, 'apple-or-gaming'],
  [/\b(digital vouchers?|gift cards?|vouchers?)\b/, 'by-name'],
];
// Categories whose every product is sold as a code even when IIMMPACT does
// not mark it processing_time "pin". Game top-ups are not here: most are
// credited straight to a player ID and only the PIN ones belong to vouchers.
const VOUCHER_TREE_IDS = new Set(['mobile', 'fuel', 'transport', 'grocery', 'wellness', 'shopping', 'food-or-coffee', 'apple-or-gaming', 'by-name']);

function phrase(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The PIN rule a provider category maps to, or '' when it maps to none. */
export function pinRuleForTreeCategory(name) {
  const text = phrase(name);
  const rule = TREE_RULES.find(([pattern]) => pattern.test(text));
  return rule ? rule[1] : '';
}

/** product code -> the provider category phrase it is listed under. */
export function treeCategoryIndex(catalog) {
  const index = new Map();
  for (const group of Array.isArray(catalog?.tree?.groups) ? catalog.tree.groups : []) {
    for (const category of Array.isArray(group?.categories) ? group.categories : []) {
      for (const code of Array.isArray(category?.product_codes) ? category.product_codes : []) {
        if (!index.has(String(code))) index.set(String(code), String(category?.name || ''));
      }
    }
  }
  return index;
}

/** Whether PIN Generator sells this product: a code, by its kind or its category. */
export function isPinServed(product, treeCategory = '') {
  if (!product || product.is_active === false || !product.code) return false;
  return isVoucherProduct(product) || VOUCHER_TREE_IDS.has(pinRuleForTreeCategory(treeCategory));
}

/** The PIN category for a product, preferring the provider's own category. */
export function pinCategoryFor(product, treeCategory = '') {
  const byId = (id) => PIN_CATEGORIES.find((item) => item.id === id);
  const named = classifyPinProduct(product) || byId('other');
  const rule = pinRuleForTreeCategory(treeCategory);
  if (rule === 'food-or-coffee') return named.id === 'coffee' ? named : byId('food');
  if (rule === 'apple-or-gaming') return named.id === 'gaming' ? named : byId('apple');
  if (rule && rule !== 'by-name') return byId(rule);
  return named;
}

/** Every product PIN Generator sells from a catalogue, featured ones first. */
export function pinProducts(catalog) {
  const index = treeCategoryIndex(catalog);
  const rank = (p) => {
    const i = FEATURED_PIN_ORDER.findIndex((pattern) => pattern.test(String(p.name || '')));
    return i < 0 ? FEATURED_PIN_ORDER.length : i;
  };
  return Object.entries((catalog && catalog.products) || {})
    .map(([code, p]) => (p && !p.code ? { ...p, code } : p))
    .filter((p) => isPinServed(p, index.get(String(p?.code))))
    .sort((a, b) => rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * Every voucher in a catalogue, by category, in PIN_CATEGORIES order. Only
 * categories with products are returned, so an empty one is never a tile.
 * Takes the catalogue (preferred: its category tree places each product) or a
 * bare product list.
 */
export function categorizePinProducts(source) {
  const isCatalog = source && !Array.isArray(source);
  const index = isCatalog ? treeCategoryIndex(source) : new Map();
  const list = isCatalog ? pinProducts(source) : (source || []).filter((p) => isPinServed(p));
  const grouped = new Map(PIN_CATEGORIES.map((category) => [category.id, []]));
  for (const product of list) grouped.get(pinCategoryFor(product, index.get(String(product.code))).id).push(product);
  return PIN_CATEGORIES
    .map((category) => ({ ...category, products: grouped.get(category.id) }))
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      ...category,
      products: [...category.products].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }));
}
