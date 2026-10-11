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
export function categorizePinProducts(products) {
  const list = Array.isArray(products)
    ? products
    : Object.values((products && products.products) || {});
  const grouped = new Map(PIN_CATEGORIES.map((category) => [category.id, []]));
  for (const product of list) {
    if (!isVoucherProduct(product)) continue;
    const category = classifyPinProduct(product) || PIN_CATEGORIES.find((item) => item.id === 'other');
    grouped.get(category.id).push(product);
  }
  return PIN_CATEGORIES
    .map((category) => ({ ...category, products: grouped.get(category.id) }))
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      ...category,
      products: [...category.products].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    }));
}
