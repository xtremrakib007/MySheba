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
  // Recharge & bills - what somebody opens the app for most weeks, so this is
  // the category the home screen leads with.
  { key: 'recharge', icon: 'recharge', name: 'Mobile Top-Up', kind: 'service', cat: 'recharge', home: true },
  { key: 'internet', icon: 'internet', name: 'Internet (Data & Voice)', kind: 'service', cat: 'recharge', home: true },
  { key: 'offerpacks', icon: 'internet', name: 'Offer Packs', kind: 'service', cat: 'recharge', home: true },
  { key: 'billpayment', icon: 'billpayment', name: 'Bill Payment', kind: 'service', cat: 'recharge', home: true },
  { key: 'rechargePin', icon: 'recharge', name: 'PIN Generate', kind: 'rechargePin', cat: 'recharge' },
  { key: 'entertainment', icon: 'entertainment', name: 'Entertainment', kind: 'service', cat: 'recharge' },

  // Sending money home is the other weekly errand.
  { key: 'remittance', icon: 'remittance', name: 'Remittance', kind: 'service', cat: 'money', home: true },
  { key: 'mobilebanking', icon: 'mobilebanking', name: 'Mobile Banking', kind: 'service', cat: 'money', home: true },

  // Travel: booked occasionally and thought about first, so one tap away.
  { key: 'bus', icon: 'bus', name: 'Bus', kind: 'buspicker', cat: 'travel' },
  { key: 'train', icon: 'train', name: 'Train', kind: 'webview', cat: 'travel' },
  { key: 'flight', icon: 'flight', name: 'Flight', kind: 'service', cat: 'travel' },

  // Malaysia worker / immigration services: a few times a year at most, and
  // never in a hurry at a counter.
  { key: 'visa', icon: 'visa', name: 'Visa', kind: 'webview', cat: 'immigration' },
  { key: 'fomema', icon: 'fomema', name: 'FOMEMA', kind: 'webview', cat: 'immigration' },
  { key: 'mydigital', icon: 'mydigital', name: 'Malaysia Arrival Card', kind: 'webview', cat: 'immigration' },
  { key: 'passport', icon: 'passport', name: 'Passport', kind: 'webview', cat: 'immigration' },

  { key: 'salary', icon: 'salary', name: 'Salary & Payslip', kind: 'salary', cat: 'personal' },
  { key: 'documents', icon: 'passport', name: 'Documents', kind: 'documents', cat: 'personal' },

  // Always last, never in a category: it is the way to everything above that
  // the home screen did not show.
  { key: 'moreFeaturesTile', icon: 'more', name: 'More Services', kind: 'moreFeaturesLink' },
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
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
  ],
  superadmin: [
    { key: 'adminFeatures', icon: '⚙️', name: 'Superadmin Features', kind: 'adminFeatures', cat: 'manage', home: true },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', cat: 'manage', home: true },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', cat: 'manage', home: true },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support', cat: 'manage', home: true },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
  ],
};

const STAFF_CAPABILITY_TILES = [
  { key: 'adminSupport', icon: '🎧', name: 'Support Inbox', kind: 'staffSupport', needs: ['support'], cat: 'manage', home: true },
  { key: 'inquiries', icon: '🗺️', name: 'Inquiries', kind: 'staffInquiries', needs: ['support'], cat: 'manage', home: true },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', needs: ['orders', 'finance'], cat: 'manage', home: true },
  { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', needs: ['finance'], cat: 'manage', home: true },
  { key: 'reports', icon: '📊', name: 'Reports', kind: 'staffReports', needs: ['reports'], cat: 'manage', home: true },
  { key: 'ledger', icon: '📒', name: 'Ledger', kind: 'staffLedger', needs: ['reports'], cat: 'manage', home: true },
  { key: 'walletFunding', icon: '🤝', name: 'Wallet Funding', kind: 'staffFunding', needs: ['finance'], cat: 'manage', home: true },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount', cat: 'personal' },
  { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile', cat: 'personal' },
];

// Admin keeps its hub; the money tiles appear only with finance/orders.
const ADMIN_TILE_NEEDS = { topup: ['finance'], history: ['orders', 'finance'], ledger: ['reports'], walletFunding: ['finance'] };

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
 * A superadmin can rename a built-in WebView tile, give it another icon, move
 * it off the home screen or switch it off, and can add new ones. The declared
 * list stays the source of order and behaviour; only the label and icon are
 * overlaid, and anything added is appended.
 */
export function withWebviewConfig(list, webviewPages) {
  const pages = webviewPages || {};
  const overlaid = list
    .map((item) => {
      const page = item.kind === 'webview' ? pages[item.key] : null;
      // `page.home === undefined` means a superadmin has never said either way,
      // so the declared flag stands. Reading it as `!== false` made silence mean
      // yes, which would drag Train, Visa, FOMEMA and Passport back onto the
      // home screen the moment their page had any config row at all.
      return page
        ? { ...item, name: page.name || item.name, emoji: page.icon || '', home: page.home === undefined ? item.home : page.home !== false }
        : item;
    })
    .filter((item) => item.kind !== 'webview' || !pages[item.key] || pages[item.key].active !== false);
  const extra = Object.values(pages)
    .filter((p) => p.custom && p.active !== false)
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
  { key: 'recharge', icon: '\uD83D\uDCF1', name: 'Recharge', service: { key: 'recharge', kind: 'service' } },
  { key: 'remittance', icon: '\uD83D\uDCB8', name: 'Remittance', service: { key: 'remittance', kind: 'service' } },
  { key: 'mobilebanking', icon: '\uD83C\uDFE6', name: 'Mobile Banking', service: { key: 'mobilebanking', kind: 'service' } },

  { key: 'internet', icon: '\uD83D\uDCE1', name: 'Internet', service: { key: 'internet', kind: 'service' } },
  { key: 'billpayment', icon: '\uD83E\uDDFE', name: 'Bill Payment', service: { key: 'billpayment', kind: 'service' } },
  { key: 'rechargePin', icon: '\uD83D\uDD22', name: 'PIN Generate', service: { key: 'rechargePin', kind: 'rechargePin' } },
  // offerpacks is the one customer key ServiceArt has no drawing for, so this
  // emoji is what renders rather than a fallback nobody sees.
  { key: 'offerpacks', icon: '\uD83C\uDF81', name: 'Offer Packs', service: { key: 'offerpacks', kind: 'service' } },
  { key: 'entertainment', icon: '\uD83C\uDFAC', name: 'Entertainment', service: { key: 'entertainment', kind: 'service' } },
  { key: 'flight', icon: '\u2708\uFE0F', name: 'Flight', service: { key: 'flight', kind: 'service' } },
  { key: 'bus', icon: '\uD83D\uDE8C', name: 'Bus', service: { key: 'bus', kind: 'buspicker' } },
  { key: 'train', icon: '\uD83D\uDE82', name: 'Train', service: { key: 'train', kind: 'webview' } },

  { key: 'visa', icon: '\uD83D\uDEC2', name: 'Visa', service: { key: 'visa', kind: 'webview' } },
  { key: 'mydigital', icon: '\uD83D\uDCBB', name: 'Malaysia Arrival Card', service: { key: 'mydigital', kind: 'webview' } },
  { key: 'passport', icon: '\uD83D\uDCD9', name: 'Passport', service: { key: 'passport', kind: 'webview' } },
  { key: 'fomema', icon: '\uD83E\uDE7A', name: 'FOMEMA', service: { key: 'fomema', kind: 'webview' } },

  { key: 'salary', icon: '\uD83D\uDCB5', name: 'Salary & Payslip', service: { key: 'salary', kind: 'salary' } },
  { key: 'documents', icon: '\uD83D\uDCC4', name: 'Documents', service: { key: 'documents', kind: 'documents' } },
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
export function adminLandingTiles(webviewPages, hasArt = () => false) {
  const pages = webviewPages || {};
  const tileFor = (page) => ({
    key: page.key,
    ...(hasArt(page.icon) ? { art: page.icon, icon: '\uD83C\uDF10' } : { icon: page.icon || '\uD83C\uDF10' }),
    name: page.name,
    service: { key: page.key, kind: 'webview' },
  });
  const overlaid = ADMIN_HOME
    .filter((item) => !(item.service && item.service.kind === 'webview' && pages[item.key] && pages[item.key].active === false))
    .map((item) => (item.service && item.service.kind === 'webview' && pages[item.key] ? { ...item, ...tileFor(pages[item.key]) } : item));
  const extra = Object.values(pages).filter((p) => p.custom && p.active !== false).map(tileFor);
  return [...overlaid, ...extra];
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
export function visibleTiles({ role, can, webviewPages, isActive = () => true, homeOnly = false }) {
  const all = withWebviewConfig(servicesForRole(role, can), webviewPages);
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
export function overflowTiles({ role = 'customer', can, webviewPages, isActive = () => true, excludeKinds = [] }) {
  const exclude = new Set(excludeKinds);
  return withWebviewConfig(servicesForRole(role, can), webviewPages)
    .filter((tile) => isActive(gridKeyFor(tile)))
    .filter((tile) => !tile.home && tile.kind !== 'moreFeaturesLink' && !exclude.has(tile.kind));
}
