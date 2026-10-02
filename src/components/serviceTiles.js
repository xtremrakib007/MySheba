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
const CUSTOMER_SERVICES = [
  // Money & connectivity
  { key: 'recharge', icon: 'recharge', name: 'Mobile Top-Up', kind: 'service' , home: true },
  { key: 'internet', icon: 'internet', name: 'Internet (Data & Voice)', kind: 'service' , home: true },
  { key: 'rechargePin', icon: 'recharge', name: 'PIN Generate', kind: 'rechargePin' , home: true },
  { key: 'billpayment', icon: 'billpayment', name: 'Bill Payment', kind: 'service' , home: true },
  { key: 'mobilebanking', icon: 'mobilebanking', name: 'Mobile Banking', kind: 'service' , home: true },
  { key: 'remittance', icon: 'remittance', name: 'Remittance', kind: 'service' , home: true },

  // Travel
  { key: 'bus', icon: 'bus', name: 'Bus', kind: 'buspicker' , home: true },
  { key: 'train', icon: 'train', name: 'Train', kind: 'webview' , home: true },
  { key: 'flight', icon: 'flight', name: 'Flight', kind: 'service' , home: true },

  // Malaysia worker / immigration services
  { key: 'visa', icon: 'visa', name: 'Visa', kind: 'webview' , home: true },
  { key: 'fomema', icon: 'fomema', name: 'FOMEMA', kind: 'webview' , home: true },
  { key: 'mydigital', icon: 'mydigital', name: 'Malaysia Arrival Card', kind: 'webview' , home: true },
  { key: 'passport', icon: 'passport', name: 'Passport', kind: 'webview' , home: true },

  // Other services
  { key: 'offerpacks', icon: 'internet', name: 'Offer Packs', kind: 'service' , home: true },
  { key: 'entertainment', icon: 'entertainment', name: 'Entertainment', kind: 'service' , home: true },
  { key: 'salary', icon: 'salary', name: 'Salary & Payslip', kind: 'salary' },
  { key: 'documents', icon: 'passport', name: 'Documents', kind: 'documents' },
  { key: 'moreFeaturesTile', icon: 'more', name: 'More Services', kind: 'moreFeaturesLink' },
];

// The services every role can actually use. A dealer still sells a top-up
// and books a bus; the staff grids used to stop at six management tiles and
// offered none of this, so the one grid the app has looked like two
// different apps depending on who signed in.
// Customer-facing services are available to every authenticated role.
// Management/operations tiles remain role-specific below, but a staff role
// must never lose the same service catalogue a customer can use.
const SHARED_SERVICES = CUSTOMER_SERVICES.map(({ home, ...service }) => ({ ...service }));

const STAFF_SERVICES = {
  dealer: [
    { key: 'dealerFeatures', icon: 'more', name: 'Dealer Features', kind: 'dealerFeatures' },
    { key: 'topup', icon: 'topup', name: 'Top-Up', kind: 'topup' },
    { key: 'history', icon: 'history', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: 'support', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: 'account', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: 'profile', name: 'Profile', kind: 'profile' },
    ...SHARED_SERVICES,
  ],
  reseller: [
    { key: 'resellerFeatures', icon: 'more', name: 'Reseller Features', kind: 'resellerFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Up', kind: 'topup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
    ...SHARED_SERVICES,
  ],
  admin: [
    { key: 'adminFeatures', icon: 'more', name: 'Admin Features', kind: 'adminFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
    ...SHARED_SERVICES,
  ],
  superadmin: [
    { key: 'adminFeatures', icon: '⚙️', name: 'Superadmin Features', kind: 'adminFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
    ...SHARED_SERVICES,
  ],
};

const STAFF_CAPABILITY_TILES = [
  { key: 'adminSupport', icon: '🎧', name: 'Support Inbox', kind: 'staffSupport', needs: ['support'] },
  { key: 'inquiries', icon: '🗺️', name: 'Inquiries', kind: 'staffInquiries', needs: ['support'] },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', needs: ['orders', 'finance'] },
  { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', needs: ['finance'] },
  { key: 'reports', icon: '📊', name: 'Reports', kind: 'staffReports', needs: ['reports'] },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ...SHARED_SERVICES,
];

// Admin keeps its hub; the money tiles appear only with finance/orders.
const ADMIN_TILE_NEEDS = { topup: ['finance'], history: ['orders', 'finance'] };

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
      return page ? { ...item, name: page.name || item.name, emoji: page.icon || '', home: page.home !== false } : item;
    })
    .filter((item) => item.kind !== 'webview' || !pages[item.key] || pages[item.key].active !== false);
  const extra = Object.values(pages)
    .filter((p) => p.custom && p.active !== false)
    .map((p) => ({ key: p.key, icon: p.icon || 'moreFeaturesTile', emoji: p.icon || '', name: p.name, kind: 'webview', home: p.home !== false }));
  return [...overlaid, ...extra];
}
