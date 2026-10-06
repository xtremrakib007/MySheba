// Which service tiles each role gets, as data.
//
// Pulled out of ServiceGrid so the answer to "does a reseller see this tile?"
// can be computed in a test instead of read out of a render function. That
// question stopped being obvious once a superadmin could add WebView pages:
// every staff list ends in ...SHARED_SERVICES, so an added page reaches all of
// them through one line, and a change to that line would quietly take it away
// from four roles at once.
//
// Nothing here touches React or React Native - it is lists and a filter.
// This replaced "the first N tiles", which cut Bus, Train and Flight off the
// home screen purely because travel happens to be declared after money. The
// home set is a decision, so it is written down as one: eight services plus
// More Services, which is exactly three rows of three.
/**
 * The headings a grid is divided into, in the order they appear.
 *
 * Eighteen tiles in one unbroken block is a wall: everything is equally
 * prominent, so nothing is, and finding Passport means reading all eighteen
 * labels. A heading lets someone skip four tiles at a time.
 *
 * `home` says whether that category appears on the home screen at all. Travel
 * and immigration are big, occasional, researched decisions - nobody opens the
 * app at a bus stop to renew a passport - so they live one tap away under More
 * Services, while the things somebody does weekly stay on the first screen.
 *
 * Order is deliberate and not alphabetical: it is how often the category is
 * opened, which is the only order that makes the first screen useful.
 */
export const TILE_CATEGORIES = [
  { key: 'manage', label: 'Management', subtitle: 'Transactions, accounts and operations', home: true },
  { key: 'recharge', label: 'Recharge & Bills', subtitle: 'Top-ups, data, packs and bills', home: true },
  { key: 'money', label: 'Send Money', subtitle: 'Remittance and mobile banking', home: true },
  { key: 'travel', label: 'Travel', subtitle: 'Bus, train and flight booking', home: false },
  { key: 'immigration', label: 'Visa & Immigration', subtitle: 'Permits, passport and medical', home: false },
  { key: 'personal', label: 'My Account', subtitle: 'Your documents, salary and activity', home: false },
];

const CATEGORY_ORDER = TILE_CATEGORIES.map((c) => c.key);

/** The category a tile belongs to, as a row the renderer can read. */
export function categoryMeta(key) {
  return TILE_CATEGORIES.find((c) => c.key === key) || { key: 'other', label: 'Other', subtitle: '', home: false };
}

/**
 * Tiles split into their categories, in TILE_CATEGORIES order.
 *
 * An empty category returns no section, so a role that sells no travel gets no
 * bare Travel heading. A tile with a category nobody declared lands in "Other"
 * last rather than vanishing - a tile that is not drawn is a feature that
 * cannot be reached, which is the one outcome worse than an ugly grid.
 */
export function groupTilesByCategory(tiles) {
  const groups = new Map();
  for (const tile of tiles || []) {
    const key = CATEGORY_ORDER.includes(tile.cat) ? tile.cat : 'other';
    if (!groups.has(key)) groups.set(key, { ...categoryMeta(key), tiles: [] });
    groups.get(key).tiles.push(tile);
  }
  return [...groups.values()].sort((a, b) => {
    const ra = CATEGORY_ORDER.indexOf(a.key), rb = CATEGORY_ORDER.indexOf(b.key);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });
}

const CUSTOMER_SERVICES = [
  // The home screen is these twelve, in this order: four rows of three, no
  // short row and no gap. Declaration order IS render order, so the rows below
  // are the rows on the phone.
  //
  // Row 1 - airtime and data
  { key: 'recharge', icon: 'recharge', name: 'Mobile Recharge', kind: 'service', cat: 'recharge', home: true },
  { key: 'internet', icon: 'internet', name: 'Internet', kind: 'service', cat: 'recharge', home: true },
  { key: 'rechargePin', icon: 'recharge', name: 'PIN Generate', kind: 'rechargePin', cat: 'recharge', home: true },

  // Row 2 - bills
  { key: 'billpayment', icon: 'billpayment', name: 'Bill Pay', kind: 'service', cat: 'recharge', home: true },
  { key: 'jompay', icon: 'billpayment', art: 'photoJompay', name: 'JomPAY', kind: 'billShortcut', cat: 'recharge', home: true,
    seed: { country: 'MY', category: 'jompay', provider: 'JomPAY' }, startStep: 3 },
  { key: 'tngewallet', icon: 'walletTransfer', art: 'photoTngewallet', name: 'TnG eWallet', kind: 'tngShortcut', cat: 'money', home: true,
    seed: { country: 'MY', category: 'ewallet', provider: "Touch 'n Go eWallet" }, startStep: 3 },

  // Row 3 - money
  { key: 'mobilebanking', icon: 'mobilebanking', name: 'Mobile Banking', kind: 'service', cat: 'money', home: true },
  { key: 'remittance', icon: 'remittance', name: 'Remittance', kind: 'service', cat: 'money', home: true },
  { key: 'offerpacks', icon: 'internet', name: 'Offer Packs', kind: 'service', cat: 'recharge', home: true },

  // Row 4 - tickets
  { key: 'flight', icon: 'flight', name: 'Flight Ticket', kind: 'service', cat: 'travel', home: true },
  { key: 'bus', icon: 'bus', name: 'Bus Ticket', kind: 'buspicker', cat: 'travel', home: true },
  { key: 'train', icon: 'train', name: 'Train Ticket', kind: 'webview', cat: 'travel', home: true },

  // Row 5 - immigration, then the way to everything else
  { key: 'mydigital', icon: 'mydigital', name: 'Malaysia Arrival Card', kind: 'webview', cat: 'immigration', home: true },
  { key: 'passport', icon: 'passport', name: 'Passport Appointment', kind: 'webview', cat: 'immigration', home: true },
  { key: 'moreFeaturesTile', icon: 'more', name: 'More Features', kind: 'moreFeaturesLink', home: true },

  // Everything below is reached through More Features. Still categorised,
  // because that screen groups them.
  { key: 'entertainment', icon: 'entertainment', name: 'Entertainment', kind: 'service', cat: 'recharge' },
  { key: 'visa', icon: 'visa', name: 'Visa', kind: 'webview', cat: 'immigration' },
  { key: 'fomema', icon: 'fomema', name: 'FOMEMA', kind: 'webview', cat: 'immigration' },
  { key: 'salary', icon: 'salary', name: 'Salary & OT', kind: 'salary', cat: 'personal' },
];

// The services every role can actually use. A dealer still sells a top-up
// and books a bus; the staff grids used to stop at six management tiles and
// offered none of this, so the one grid the app has looked like two
// different apps depending on who signed in.
//
// The home flags travel now. They used to be stripped here, because a staff
// grid showed its whole catalogue - which made a staff home twenty-four tiles
// of equal weight, the same wall the customer home had. A staff member gets
// the same treatment: the handful they use daily, and More Services for the
// rest.
const SHARED_SERVICES = CUSTOMER_SERVICES.map((service) => ({ ...service }));

// Role-specific management tiles ONLY. servicesForRole appends the shared
// service catalogue once; these lists used to end with it as well, so every
// staff role was handed all eighteen customer tiles twice - 42 tiles where 24
// were meant, with duplicate React keys and every service drawn on two rows.
const STAFF_SERVICES = {
  dealer: [
    { key: 'dealerFeatures', icon: 'more', name: 'Dealer Features', kind: 'dealerFeatures', cat: 'manage', home: true },
    { key: 'topup', icon: 'topup', name: 'Top-Up', kind: 'topup', cat: 'manage', home: true },
    { key: 'history', icon: 'history', name: 'Transactions', kind: 'history', cat: 'manage', home: true },
    { key: 'support', icon: 'support', name: 'Support', kind: 'support', cat: 'manage', home: true },
    { key: 'myAccount', icon: 'account', name: 'My Account', kind: 'myaccount', cat: 'personal' },
    { key: 'profile', icon: 'profile', name: 'Profile', kind: 'profile', cat: 'personal' },
  ],
  reseller: [
    { key: 'resellerFeatures', icon: 'more', name: 'Reseller Features', kind: 'resellerFeatures', cat: 'manage', home: true },
    { key: 'topup', icon: '💰', name: 'Top-Up', kind: 'topup', cat: 'manage', home: true },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', cat: 'manage', home: true },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support', cat: 'manage', home: true },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
  ],
  admin: [
    { key: 'adminFeatures', icon: 'more', name: 'Admin Features', kind: 'adminFeatures', cat: 'manage', home: true },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', cat: 'manage', home: true },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', cat: 'manage', home: true },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support', cat: 'manage', home: true },
    { key: 'invoices', icon: '🧾', name: 'Invoices', kind: 'staffInvoices', cat: 'manage', home: true },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
  ],
  superadmin: [
    { key: 'adminFeatures', icon: '⚙️', name: 'Superadmin Features', kind: 'adminFeatures', cat: 'manage', home: true },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', cat: 'manage', home: true },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', cat: 'manage', home: true },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support', cat: 'manage', home: true },
    { key: 'invoices', icon: '🧾', name: 'Invoices', kind: 'staffInvoices', cat: 'manage', home: true },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
  ],
};

const STAFF_CAPABILITY_TILES = [
  { key: 'adminSupport', icon: '🎧', name: 'Support Inbox', kind: 'staffSupport', needs: ['support'], cat: 'manage', home: true },
  { key: 'inquiries', icon: '🗺️', name: 'Inquiries', kind: 'staffInquiries', needs: ['support'], cat: 'manage', home: true },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', needs: ['orders', 'finance', 'review'], cat: 'manage', home: true },
  { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', needs: ['finance'], cat: 'manage', home: true },
  { key: 'reports', icon: '📊', name: 'Reports', kind: 'staffReports', needs: ['reports'], cat: 'manage', home: true },
  { key: 'ledger', icon: '📒', name: 'Transaction Ledger', kind: 'staffLedger', needs: ['reports'], cat: 'manage', home: true },
  { key: 'walletFunding', icon: '🤝', name: 'Wallet Funding', kind: 'staffFunding', needs: ['finance'], cat: 'manage', home: true },
  // 'reports' as well as 'finance': the history of what was paid to a provider
  // is a reporting question, and reading it grants nothing - raising and
  // approving are both gated on 'finance' in the callables.
  { key: 'invoices', icon: '🧾', name: 'Invoices', kind: 'staffInvoices', needs: ['finance', 'reports'], cat: 'manage', home: true },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
  { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
];

// Admin keeps its hub; the money tiles appear only with finance/orders.
const ADMIN_TILE_NEEDS = { topup: ['finance'], history: ['orders', 'finance', 'review'], ledger: ['reports'], walletFunding: ['finance'], invoices: ['finance', 'reports'] };

export { CUSTOMER_SERVICES, SHARED_SERVICES, STAFF_SERVICES, STAFF_CAPABILITY_TILES, ADMIN_TILE_NEEDS };

export const STAFF_ROLES = ['dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'];

/**
 * The tiles a role starts from, before the grid applies its own gates.
 *
 * `can` is the capability test; support and finance see only what their
 * capabilities own, and admin's money tiles follow the same rule.
 */
export function servicesForRole(role, can = () => true) {
  const isStaff = STAFF_ROLES.includes(role);
  if (!isStaff) return CUSTOMER_SERVICES;
  const roleSpecific = role === 'support' || role === 'finance'
    ? STAFF_CAPABILITY_TILES.filter((t) => !t.needs || t.needs.some((cap) => can(cap)))
    : role === 'admin'
      ? STAFF_SERVICES.admin.filter((t) => !ADMIN_TILE_NEEDS[t.key] || ADMIN_TILE_NEEDS[t.key].some((cap) => can(cap)))
      : (STAFF_SERVICES[role] || STAFF_SERVICES.admin);
  return [...roleSpecific, ...SHARED_SERVICES];
}

/**
 * Every tile a superadmin can rename, once each, grouped by where it appears.
 *
 * Built from the declared lists rather than written out again, so a tile added
 * anywhere becomes editable without anybody remembering to add it here - which
 * is the failure this would otherwise have: an editor that silently covers most
 * of the app.
 *
 * Keyed by tile key, and a key appears in several lists (Transactions is on the
 * dealer grid, the capability grid and the account rows), so it is listed once
 * under the first place it is found. Renaming it renames all of them, which is
 * the point: they are one destination.
 */
export function editableTiles() {
  const groups = [
    ['Customer services', CUSTOMER_SERVICES],
    ['Staff management', [...STAFF_CAPABILITY_TILES, ...Object.values(STAFF_SERVICES).flat()]],
    ['Admin landing', ADMIN_HOME],
    ['Account rows', [...PERSONAL_FEATURES, ...STAFF_FEATURES]],
  ];
  const seen = new Set();
  const out = [];
  for (const [label, list] of groups) {
    const tiles = [];
    for (const tile of list) {
      if (!tile || !tile.key || seen.has(tile.key)) continue;
      seen.add(tile.key);
      tiles.push({ key: tile.key, name: tile.name, icon: tile.icon, art: tile.art });
    }
    if (tiles.length) out.push({ label, tiles });
  }
  return out;
}

/**
 * A superadmin's own name and icon for a tile, over the declared one.
 *
 * Applied to every grid, after the WebView overlay and before anything is
 * filtered, so one rename reaches the home screen, More Features, the admin
 * landing and the staff grids at once rather than four lists having to agree.
 *
 * Only `name` and `icon` move. Nothing here touches `kind`, `key`, `screen`,
 * `service` or `cat`: a tile renamed badly is a bad label, but a tile repointed
 * would be a way to dress one feature up as another, and a label editor has no
 * business being able to do that.
 *
 * An icon is either the name of a drawing the app ships - set as `art`, which
 * the Tile prefers over the drawing its key would otherwise pick - or a short
 * piece of text drawn as an emoji.
 */
export function applyTileLabels(list, tileLabels) {
  const labels = tileLabels || {};
  return (list || []).map((item) => {
    const override = labels[item.key];
    if (!override) return item;
    const next = { ...item };
    if (override.name) next.name = override.name;
    if (override.icon) {
      if (override.iconIsArt) { next.art = override.icon; next.emoji = ''; }
      // `art: ''` matters: without it a tile whose key has a drawing would keep
      // drawing it and the chosen emoji would never appear.
      else { next.emoji = override.icon; next.art = ''; }
    }
    return next;
  });
}

/**
 * A superadmin can rename a built-in WebView tile, give it another icon, move
 * it off the home screen or switch it off, and can add new ones. The declared
 * list stays the source of order and behaviour; only the label and icon are
 * overlaid, and anything added is appended.
 */
/** Two addresses are the same address if only their scheme or slash differ. */
function normaliseUrl(url) {
  return String(url || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/**
 * The custom pages that are not a built-in under another name.
 *
 * Shared, because there are TWO places that turn stored pages into tiles - the
 * service grids and the superadmin landing - and fixing one of them left the
 * duplicate standing on the other. Which is exactly what happened.
 */
function customPagesBeyond(pages, builtInKeys, isAllowed = () => true) {
  const taken = new Set(
    builtInKeys.map((key) => normaliseUrl(pages[key] && pages[key].url)).filter(Boolean),
  );
  return Object.values(pages)
    .filter((p) => p.custom && isAllowed(p))
    .filter((p) => !taken.has(normaliseUrl(p.url)));
}

export function withWebviewConfig(list, webviewPages, viewer) {
  const pages = webviewPages || {};

  const allowed = (page) => {
    if (!page || page.active === false) return false;
    const v = viewer || {};
    if (Array.isArray(page.roles) && page.roles.length && !page.roles.includes(v.role)) return false;
    if (Array.isArray(page.countries) && page.countries.length && !page.countries.includes(v.country)) return false;
    if (Array.isArray(page.users) && page.users.length && !page.users.includes(v.uid)) return false;
    return true;
  };
  const overlaid = list
    .map((item) => {
      const page = item.kind === 'webview' ? pages[item.key] : null;
      // A superadmin can take a built-in OFF the home screen. They cannot force
      // one ON - where a built-in belongs is the list's decision.
      //
      // Reading the stored flag as `page.home !== false` let the config decide
      // outright, and webviewConfigService normalises every page it writes to
      // `home: page?.home !== false` - so the stored value is ALWAYS true and is
      // never undefined. Guarding on undefined therefore did nothing, and every
      // WebView tile was dragged onto the home screen: Train, Visa, FOMEMA,
      // Arrival Card and Passport all reappeared there, while Bus and Flight -
      // the travel tiles that are not WebViews - correctly stayed off. That is
      // what the two half-empty TRAVEL and VISA sections on the home screen
      // were.
      return page
        ? { ...item, name: page.name || item.name, emoji: page.icon || '', home: item.home === true && page.home !== false }
        : item;
    })
    .filter((item) => item.kind !== 'webview' || !pages[item.key] || allowed(pages[item.key]));
  // A custom page pointing where a built-in already points is the SAME tile
  // under a second name: "Visa" and "Visa Status Inquiry", one page, two cards
  // in the grid and nothing to tell them apart. The built-in keeps its place
  // and the copy is dropped - it opens the same address either way.
  //
  // Matched on the address rather than the name, because the name is the half
  // somebody renamed. A custom page going somewhere of its own is untouched.
  const extra = customPagesBeyond(pages, overlaid.filter((item) => item.kind === 'webview').map((item) => item.key), allowed)
    .map((p) => ({ key: p.key, icon: p.icon || 'moreFeaturesTile', emoji: p.icon || '', name: p.name, kind: 'webview', home: p.home !== false }));
  return [...overlaid, ...extra];
}

// Admin and superadmin land here instead of ServiceGrid, so a customer service
// missing from this list is a service they simply cannot reach - which is what
// had happened to bill payment, PIN generate, offer packs, entertainment,
// FOMEMA, salary and documents. A test now fails if any customer tile is
// absent, because the omission is invisible on the screen itself.
export const ADMIN_HOME = [
  { key: 'finance', icon: '\uD83D\uDCB0', name: 'Financial Management', section: 'finance' },
  { key: 'adminAnalytics', icon: '\uD83D\uDCCA', name: 'Reports & Analytics', screen: 'adminAnalytics' },
  { key: 'ledger', icon: '\uD83D\uDCD2', name: 'Transaction Ledger', screen: 'ledger' },
  { key: 'walletFunding', icon: '\uD83E\uDD1D', name: 'Wallet Funding', screen: 'walletFunding' },
  { key: 'userManagement', icon: '\uD83D\uDC65', name: 'User Management', screen: 'userManagement' },
  { key: 'verificationManagement', icon: '\uD83E\uDEAA', name: 'KYC Management', screen: 'verificationManagement' },

  { key: 'adminSupport', icon: '\uD83C\uDFA7', name: 'Support Inbox', screen: 'adminSupport' },
  { key: 'recharge', icon: '\uD83D\uDCF1', name: 'Mobile Recharge', service: { key: 'recharge', kind: 'service' } },
  { key: 'remittance', icon: '\uD83D\uDCB8', name: 'Remittance', service: { key: 'remittance', kind: 'service' } },
  { key: 'mobilebanking', icon: '\uD83C\uDFE6', name: 'Mobile Banking', service: { key: 'mobilebanking', kind: 'service' } },

  { key: 'internet', icon: '\uD83D\uDCE1', name: 'Internet', service: { key: 'internet', kind: 'service' } },
  { key: 'billpayment', icon: '\uD83E\uDDFE', name: 'Bill Pay', service: { key: 'billpayment', kind: 'service' } },
  { key: 'jompay', icon: '\uD83C\uDDF2\uD83C\uDDFE', name: 'JomPAY', service: { key: 'jompay', kind: 'billShortcut', seed: { country: 'MY', category: 'jompay', provider: 'JomPAY' }, startStep: 3 } },
  { key: 'tngewallet', icon: '\uD83D\uDC5B', name: 'TnG eWallet', service: { key: 'tngewallet', kind: 'tngShortcut', seed: { country: 'MY', category: 'ewallet', provider: "Touch 'n Go eWallet" }, startStep: 3 } },
  { key: 'rechargePin', icon: '\uD83D\uDD22', name: 'PIN Generate', service: { key: 'rechargePin', kind: 'rechargePin' } },
  // offerpacks is the one customer key ServiceArt has no drawing for, so this
  // emoji is what renders rather than a fallback nobody sees.
  { key: 'offerpacks', icon: '\uD83C\uDF81', name: 'Offer Packs', service: { key: 'offerpacks', kind: 'service' } },
  { key: 'entertainment', icon: '\uD83C\uDFAC', name: 'Entertainment', service: { key: 'entertainment', kind: 'service' } },
  { key: 'flight', icon: '\u2708\uFE0F', name: 'Flight Ticket', service: { key: 'flight', kind: 'service' } },
  { key: 'bus', icon: '\uD83D\uDE8C', name: 'Bus Ticket', service: { key: 'bus', kind: 'buspicker' } },
  { key: 'train', icon: '\uD83D\uDE82', name: 'Train Ticket', service: { key: 'train', kind: 'webview' } },

  { key: 'visa', icon: '\uD83D\uDEC2', name: 'Visa', service: { key: 'visa', kind: 'webview' } },
  { key: 'mydigital', icon: '\uD83D\uDCBB', name: 'Malaysia Arrival Card', service: { key: 'mydigital', kind: 'webview' } },
  { key: 'passport', icon: '\uD83D\uDCD9', name: 'Passport Appointment', service: { key: 'passport', kind: 'webview' } },
  { key: 'fomema', icon: '\uD83E\uDE7A', name: 'FOMEMA', service: { key: 'fomema', kind: 'webview' } },

  { key: 'salary', icon: '\uD83D\uDCB5', name: 'Salary & OT', service: { key: 'salary', kind: 'salary' } },
  { key: 'moreFeaturesTile', icon: '\u2728', name: 'More Features', screen: 'moreFeatures' },
];

/**
 * The admin and superadmin landing grid, with the WebView configuration on it.
 *
 * Admin and superadmin do not land on ServiceGrid - App.js renders
 * AdminFeaturesScreen for them - so this is a second list, and it needs the
 * same treatment or a superadmin's own change never reaches the screen they
 * open the app on.
 *
 * `hasArt` is passed in rather than imported: FeatureGrid draws by tile key,
 * and an added page's key is a generated wv_ one that names no drawing, so a
 * chosen art icon has to travel as `art` or it prints as the word.
 */
export function adminLandingTiles(webviewPages, hasArt = () => false, tileLabels, viewer) {
  const pages = webviewPages || {};
  const allowed = (page) => {
    if (!page || page.active === false) return false;
    const v = viewer || {};
    if (Array.isArray(page.roles) && page.roles.length && !page.roles.includes(v.role)) return false;
    if (Array.isArray(page.countries) && page.countries.length && !page.countries.includes(v.country)) return false;
    if (Array.isArray(page.users) && page.users.length && !page.users.includes(v.uid)) return false;
    return true;
  };
  const tileFor = (page) => ({
    key: page.key,
    ...(hasArt(page.icon) ? { art: page.icon, icon: '\uD83C\uDF10' } : { icon: page.icon || '\uD83C\uDF10' }),
    name: page.name,
    service: { key: page.key, kind: 'webview' },
  });
  const overlaid = ADMIN_HOME
    .filter((item) => !(item.service && item.service.kind === 'webview' && pages[item.key] && !allowed(pages[item.key])))
    .map((item) => (item.service && item.service.kind === 'webview' && pages[item.key] ? { ...item, ...tileFor(pages[item.key]) } : item));
  const extra = customPagesBeyond(
    pages,
    ADMIN_HOME.filter((item) => item.service && item.service.kind === 'webview').map((item) => item.key),
    allowed,
  ).map(tileFor);
  return applyTileLabels([...overlaid, ...extra], tileLabels);
}

/** The Grid Management key a tile is gated by - not always its own key. */
export function gridKeyFor(service) {
  return ({
    buspicker: 'bus',
    webview: service.key,
    adminFeatures: 'adminFeatures',
    dealerFeatures: 'dealerFeatures',
    resellerFeatures: 'resellerFeatures',
    adminTopup: 'topup',
  }[service.kind] || service.key);
}

/**
 * The tiles a grid finally renders.
 *
 * The last two steps used to live inline in ServiceGrid, which left the end of
 * the chain - the Grid Management gate and the home-screen split - as the only
 * part no test could run. They are the steps that decide whether a tile a
 * superadmin added is on the screen or not, so they belong here with the rest.
 *
 * `isActive(key)` is the Grid Management test, passed in so this stays free of
 * Firestore. `homeOnly` is the customer home screen; a staff list carries no
 * home flags, so it falls back to the whole set rather than rendering nothing.
 */
export function visibleTiles({ role, can, webviewPages, tileLabels, viewer, dynamicFeatures = [], isActive = () => true, homeOnly = false }) {
  const dynamic = (dynamicFeatures || []).filter((f) => f && f.enabled !== false && f.archived !== true).map((f) => ({
    key: f.key, icon: f.icon || 'more', name: f.name, cat: f.category || 'other', home: f.home !== false,
    kind: f.kind === 'webview' ? 'webview' : f.kind === 'screen' ? 'dynamicScreen' : 'dynamicService',
    webviewKey: f.webviewKey || f.key, serviceKey: f.serviceKey || '', screenKey: f.screenKey || '',
  }));
  const base = withWebviewConfig(servicesForRole(role, can), webviewPages, viewer);
  const existing = new Set(base.map((x) => x.key));
  const all = applyTileLabels([...base, ...dynamic.filter((x) => !existing.has(x.key))], tileLabels);
  const active = all.filter((service) => isActive(gridKeyFor(service)));
  if (!homeOnly) return active;
  // Staff used to be exempt: their grids showed the whole catalogue, which made
  // a staff home twenty-four tiles of equal weight. They are trimmed the same
  // way now, and their management tiles are the ones flagged for it.
  //
  // The fallback stays, for a different reason than before: a list where
  // nothing is flagged would otherwise render as a single More Services tile
  // and nothing else, which looks like the app failed to load.
  const flagged = active.filter((service) => service.home);
  if (flagged.length === 0) return active;
  // More Features is flagged for home like everything else now, so appending it
  // unconditionally drew it twice - once in its declared place at the end of the
  // last row, once again on a row of its own below.
  if (flagged.some((service) => service.kind === 'moreFeaturesLink')) return flagged;
  const moreTile = active.find((service) => service.kind === 'moreFeaturesLink');
  return [...flagged, ...(moreTile ? [moreTile] : [])];
}

/**
 * The tiles THIS ROLE has that the home screen does NOT show.
 *
 * Role-aware now that staff homes are trimmed too: a dealer's overflow is a
 * dealer's catalogue minus a dealer's home screen, not a customer's.
 *
 * MoreFeaturesScreen derived this from the declared list so that adding a tile
 * puts it on the home screen or here, never nowhere. That stopped holding once
 * a superadmin could move a WebView off the home screen: the declared flags
 * still said `home: true`, so a page moved off vanished from both - exactly
 * the failure the derivation existed to prevent.
 *
 * Built from the same pipeline as the grids, so a rename or a new icon reaches
 * this screen too, and a page switched off leaves it.
 */
/**
 * The account rows on the More Features screen.
 *
 * 'My Business' is deliberately absent from the customer list: it routed to a
 * 'businessProfile' screen that no longer exists, so the tile outlived the
 * feature and opened a blank page. A tile with nowhere to go is worse than no
 * tile.
 *
 * These are here rather than in the screen so that choosing between them is
 * something a test can run - see moreFeaturesSections.
 */
export const PERSONAL_FEATURES = [
  { key: 'walletTransfer', icon: '\uD83D\uDCB8', name: 'Wallet Transfer', kind: 'walletTransfer' },
  { key: 'myDocuments', icon: '\uD83D\uDCC4', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '\uD83D\uDCBC', name: 'Salary & OT', kind: 'salary' },
  { key: 'history', icon: '\uD83D\uDCCB', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '\uD83D\uDC64', name: 'My Account', kind: 'myaccount' },
  { key: 'kyc', icon: '\uD83E\uDEAA', name: 'Profile & KYC', kind: 'kyc' },
  { key: 'support', icon: '\uD83C\uDFA7', name: 'Support', kind: 'support' },
];

export const STAFF_FEATURES = [
  { key: 'myDocuments', icon: '\uD83D\uDCC4', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '\uD83D\uDCBC', name: 'Salary & OT', kind: 'salary' },
  { key: 'history', icon: '\uD83D\uDCCB', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '\uD83D\uDC64', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '\uD83E\uDEAA', name: 'Profile & KYC', kind: 'profile' },
  { key: 'support', icon: '\uD83C\uDFA7', name: 'Support', kind: 'support' },
];

/**
 * Both halves of the More Features screen, from one call.
 *
 * They are returned together because they were able to disagree. The screen
 * picked an account list by role, and separately excluded a set of kinds built
 * from the CUSTOMER list - so on a staff account, whose rows use kind `profile`
 * rather than `kyc`, Profile was drawn under "My Account" AND under "Account &
 * Operations", two headings apart on one screen. Choosing the list and deriving
 * the exclusions are now the same step, so there is nothing left to mismatch.
 *
 * Exclusion is by kind and by key: the same feature is `documents` in the
 * catalogue and `myDocuments` in the account rows, so neither alone is enough.
 * The `personal` category is held back as well - the account section already is
 * the personal section, and two headings describing the same thing read as a
 * duplicate even when no tile is repeated.
 */
export function moreFeaturesSections({ role = 'customer', can, webviewPages, tileLabels, isActive = () => true }) {
  const declared = applyTileLabels((!role || role === 'customer') ? PERSONAL_FEATURES : STAFF_FEATURES, tileLabels);

  // An account row for something already on this role's home screen is the
  // same destination twice. Staff saw Transactions and Support as a tile on
  // their home grid AND as a row at the bottom of this screen - two tiles, one
  // place to land, and nothing to tell them apart.
  //
  // The home grid keeps it, because that is where somebody looks first. A tile
  // a superadmin has switched OFF for home is not on that grid, so its row
  // survives here - which is the rule this screen exists for: a finished
  // feature lands on the home screen or here, never nowhere.
  const onHome = new Set(
    visibleTiles({ role, can, webviewPages, tileLabels, isActive, homeOnly: true }).map((tile) => tile.key),
  );
  const account = declared.filter((row) => !onHome.has(row.key));

  // Built from what was DECLARED, not from what survived the filter above: a
  // row dropped for being on the home screen must still keep its twin out of
  // the overflow, or removing one duplicate just moves it.
  const kinds = new Set(declared.map((f) => f.kind));
  const keys = new Set(declared.map((f) => f.key));
  const overflow = overflowTiles({ role, can, webviewPages, tileLabels, isActive, excludeKinds: kinds })
    .filter((tile) => tile.cat !== 'personal' && !keys.has(tile.key));
  return { sections: groupTilesByCategory(overflow), account };
}

export function overflowTiles({ role = 'customer', can, webviewPages, tileLabels, isActive = () => true, excludeKinds = [] }) {
  const exclude = new Set(excludeKinds);
  return applyTileLabels(withWebviewConfig(servicesForRole(role, can), webviewPages), tileLabels)
    .filter((tile) => isActive(gridKeyFor(tile)))
    .filter((tile) => !tile.home && tile.kind !== 'moreFeaturesLink' && !exclude.has(tile.kind));
}
