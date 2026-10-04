// Mirrors the `countries` array from the original prototype
export const countries = [
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', dial: '+60', curr: 'MYR' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', dial: '+880', curr: 'BDT' },
  { code: 'IN', name: 'India', flag: '🇮🇳', dial: '+91', curr: 'INR' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', dial: '+977', curr: 'NPR' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', dial: '+62', curr: 'IDR' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', dial: '+92', curr: 'PKR' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲', dial: '+95', curr: 'MMK' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', dial: '+63', curr: 'PHP' },
  { code: 'KH', name: 'Cambodia', flag: '🇰🇭', dial: '+855', curr: 'KHR' },
];

// Remittance rate per country code (MYR -> local currency)
export const remitRates = {
  BD_ACC: 30.26,
  BD_CASH: 30.11,
  NP: 37.65,
  PK: 67.79,
  PH: 15.05,
  LK: 81.99,
  IN: 23.50,
  ID: 230,
  MM: 966,
};

export const rechargeOperators = {
  BD: ['Grameenphone', 'Robi', 'Banglalink', 'Airtel', 'Teletalk', 'Skitto'],
  MY: ['Celcom', 'CelcomDigi', 'U Mobile', 'Hotlink', 'XOX', 'Tunetalk', 'Unifi', 'Yes'],
  IN: ['Airtel', 'Jio', 'Vi', 'BSNL'],
  NP: ['Ncell', 'NTC'],
  ID: ['Telkomsel', 'Indosat', 'XL', 'Axis', 'Smartfren', 'StarOne', 'Tri Indonesia'],
  PK: ['Jazz', 'Zong', 'Telenor', 'Ufone'],
  MM: ['MPT', 'Ooredoo', 'MEC', 'Telenor Myanmar', 'Mytel'],
  PH: ['Globe', 'Smart', 'Smart Bro', 'TNT', 'Touch Mobile'],
  KH: ['Cellcard', 'Smart Axiata'],
};

// Who can be bought as a PIN voucher, which is not the same list as who can be
// topped up directly.
//
// Touch 'n Go sells both ways and the two are different products: the pinless
// reload is a Bill Payment that credits the wallet behind a mobile number, and
// the PIN is a voucher whose code the customer redeems themselves. They carry
// different product codes at the provider, which is why the same brand appears
// in two maps rather than one.
//
// Kept separate from rechargeOperators deliberately. Adding a wallet there
// would put it in the airtime and internet operator grids too, where nobody can
// buy a data pack for an e-wallet.
export const rechargePinBrands = {
  MY: [...(rechargeOperators.MY || []), "Touch 'n Go eWallet"],
};

export const internetPackages = [
  { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 10 },
  { name: '3GB Weekly', data: '3 GB', valid: '7 Days', price: 25 },
  { name: '10GB Monthly', data: '10 GB', valid: '30 Days', price: 50 },
  { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 100 },
];

// Data packages on offer, per operator - real plans vary operator to
// operator (a Jio pack isn't the same as an Airtel pack), so InternetSteps
// looks a package list up by the operator picked on the previous step.
// Every operator that appears in rechargeOperators above has an entry here;
// anyone missing (or a name typo) falls back to the generic internetPackages
// list so the step never renders empty. Price stays in MYR, same as
// recharge/remittance - the customer in Malaysia is paying MYR to top up
// someone's data plan in the destination country.
export const internetPackagesByOperator = {
  // Bangladesh
  Grameenphone: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 10 },
    { name: '6GB Weekly', data: '6 GB', valid: '7 Days', price: 28 },
    { name: '15GB Monthly', data: '15 GB', valid: '30 Days', price: 55 },
    { name: '30GB Monthly', data: '30 GB', valid: '30 Days', price: 95 },
  ],
  Robi: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 25 },
    { name: '12GB Monthly', data: '12 GB', valid: '30 Days', price: 48 },
    { name: '25GB Monthly', data: '25 GB', valid: '30 Days', price: 85 },
  ],
  Banglalink: [
    { name: '1.5GB Daily', data: '1.5 GB', valid: '1 Day', price: 9 },
    { name: '6GB Weekly', data: '6 GB', valid: '7 Days', price: 24 },
    { name: '18GB Monthly', data: '18 GB', valid: '30 Days', price: 50 },
    { name: '40GB Monthly', data: '40 GB', valid: '30 Days', price: 90 },
  ],
  Airtel: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '4GB Weekly', data: '4 GB', valid: '7 Days', price: 22 },
    { name: '10GB Monthly', data: '10 GB', valid: '30 Days', price: 45 },
    { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 100 },
  ],
  // Malaysia
  Celcom: [
    { name: '3GB Daily', data: '3 GB', valid: '1 Day', price: 11 },
    { name: '18GB Weekly', data: '18 GB', valid: '7 Days', price: 32 },
    { name: '45GB Monthly', data: '45 GB', valid: '30 Days', price: 62 },
    { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 95 },
  ],
  CelcomDigi: [
    { name: '2GB Daily', data: '2 GB', valid: '1 Day', price: 10 },
    { name: '15GB Weekly', data: '15 GB', valid: '7 Days', price: 30 },
    { name: '40GB Monthly', data: '40 GB', valid: '30 Days', price: 58 },
    { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 90 },
  ],
  'U Mobile': [
    { name: '5GB Daily', data: '5 GB', valid: '1 Day', price: 10 },
    { name: '25GB Weekly', data: '25 GB', valid: '7 Days', price: 28 },
    { name: '60GB Monthly', data: '60 GB', valid: '30 Days', price: 55 },
    { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 85 },
  ],
  Unifi: [
    { name: '4GB Daily', data: '4 GB', valid: '1 Day', price: 11 },
    { name: '20GB Weekly', data: '20 GB', valid: '7 Days', price: 30 },
    { name: '50GB Monthly', data: '50 GB', valid: '30 Days', price: 60 },
    { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 92 },
  ],
  Yes: [
    { name: '4GB Daily', data: '4 GB', valid: '1 Day', price: 10 },
    { name: '20GB Weekly', data: '20 GB', valid: '7 Days', price: 27 },
    { name: '55GB Monthly', data: '55 GB', valid: '30 Days', price: 56 },
    { name: 'Unlimited', data: 'Unlimited', valid: '30 Days', price: 86 },
  ],
  // India
  Jio: [
    { name: '1.5GB Daily', data: '1.5 GB', valid: '1 Day', price: 8 },
    { name: '2GB/day Weekly', data: '14 GB', valid: '7 Days', price: 20 },
    { name: '2GB/day Monthly', data: '60 GB', valid: '28 Days', price: 40 },
    { name: 'Unlimited', data: 'Unlimited', valid: '28 Days', price: 75 },
  ],
  Vi: [
    { name: '1.5GB Daily', data: '1.5 GB', valid: '1 Day', price: 8 },
    { name: '2GB/day Weekly', data: '14 GB', valid: '7 Days', price: 21 },
    { name: '1.5GB/day Monthly', data: '45 GB', valid: '28 Days', price: 42 },
    { name: 'Unlimited', data: 'Unlimited', valid: '28 Days', price: 78 },
  ],
  // Nepal
  Ncell: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 10 },
    { name: '6GB Weekly', data: '6 GB', valid: '7 Days', price: 26 },
    { name: '15GB Monthly', data: '15 GB', valid: '30 Days', price: 50 },
    { name: '30GB Monthly', data: '30 GB', valid: '30 Days', price: 88 },
  ],
  NTC: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 24 },
    { name: '12GB Monthly', data: '12 GB', valid: '30 Days', price: 46 },
    { name: '25GB Monthly', data: '25 GB', valid: '30 Days', price: 82 },
  ],
  // Indonesia
  Telkomsel: [
    { name: '2GB Daily', data: '2 GB', valid: '1 Day', price: 9 },
    { name: '10GB Weekly', data: '10 GB', valid: '7 Days', price: 22 },
    { name: '25GB Monthly', data: '25 GB', valid: '30 Days', price: 45 },
    { name: '50GB Monthly', data: '50 GB', valid: '30 Days', price: 78 },
  ],
  Indosat: [
    { name: '3GB Daily', data: '3 GB', valid: '1 Day', price: 8 },
    { name: '12GB Weekly', data: '12 GB', valid: '7 Days', price: 20 },
    { name: '30GB Monthly', data: '30 GB', valid: '30 Days', price: 42 },
    { name: '60GB Monthly', data: '60 GB', valid: '30 Days', price: 72 },
  ],
  XL: [
    { name: '2GB Daily', data: '2 GB', valid: '1 Day', price: 8 },
    { name: '10GB Weekly', data: '10 GB', valid: '7 Days', price: 21 },
    { name: '28GB Monthly', data: '28 GB', valid: '30 Days', price: 43 },
    { name: '55GB Monthly', data: '55 GB', valid: '30 Days', price: 75 },
  ],
  // Pakistan
  Jazz: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '6GB Weekly', data: '6 GB', valid: '7 Days', price: 23 },
    { name: '16GB Monthly', data: '16 GB', valid: '30 Days', price: 48 },
    { name: '32GB Monthly', data: '32 GB', valid: '30 Days', price: 85 },
  ],
  Zong: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 8 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 21 },
    { name: '14GB Monthly', data: '14 GB', valid: '30 Days', price: 45 },
    { name: '30GB Monthly', data: '30 GB', valid: '30 Days', price: 80 },
  ],
  Telenor: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 8 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 22 },
    { name: '15GB Monthly', data: '15 GB', valid: '30 Days', price: 46 },
    { name: '28GB Monthly', data: '28 GB', valid: '30 Days', price: 82 },
  ],
  // Myanmar
  MPT: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 23 },
    { name: '12GB Monthly', data: '12 GB', valid: '30 Days', price: 44 },
    { name: '25GB Monthly', data: '25 GB', valid: '30 Days', price: 78 },
  ],
  Ooredoo: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 22 },
    { name: '12GB Monthly', data: '12 GB', valid: '30 Days', price: 43 },
    { name: '25GB Monthly', data: '25 GB', valid: '30 Days', price: 76 },
  ],
  // Philippines
  Globe: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '6GB Weekly', data: '6 GB', valid: '7 Days', price: 24 },
    { name: '15GB Monthly', data: '15 GB', valid: '30 Days', price: 47 },
    { name: '30GB Monthly', data: '30 GB', valid: '30 Days', price: 82 },
  ],
  Smart: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 9 },
    { name: '6GB Weekly', data: '6 GB', valid: '7 Days', price: 23 },
    { name: '15GB Monthly', data: '15 GB', valid: '30 Days', price: 46 },
    { name: '30GB Monthly', data: '30 GB', valid: '30 Days', price: 80 },
  ],
  // Cambodia
  'Smart Axiata': [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 8 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 22 },
    { name: '14GB Monthly', data: '14 GB', valid: '30 Days', price: 45 },
    { name: '28GB Monthly', data: '28 GB', valid: '30 Days', price: 78 },
  ],
  Cellcard: [
    { name: '1GB Daily', data: '1 GB', valid: '1 Day', price: 8 },
    { name: '5GB Weekly', data: '5 GB', valid: '7 Days', price: 21 },
    { name: '12GB Monthly', data: '12 GB', valid: '30 Days', price: 42 },
    { name: '25GB Monthly', data: '25 GB', valid: '30 Days', price: 75 },
  ],
};

export const busCities = ['Kuala Lumpur', 'Penang', 'Johor Bahru', 'Ipoh', 'Malacca', 'Kuantan', 'Seremban', 'Kota Bharu'];

export const busOptions = [
  { op: 'Aeroline', type: 'VIP', dep: '08:00', arr: '13:00', price: 55, seats: '15 seats' },
  { op: 'Transnasional', type: 'AC', dep: '10:00', arr: '15:00', price: 40, seats: '8 seats' },
];

export const trainStations = ['KL Sentral', 'Butterworth', 'Johor Bahru', 'Ipoh', 'Seremban', 'Padang Besar'];

export const trainOptions = [
  { name: 'ETS Platinum', num: 'EP9201', dep: '07:00', arr: '11:15', price: 95 },
  { name: 'ETS Gold', num: 'EG9310', dep: '10:00', arr: '14:30', price: 75 },
];

export const trainClasses = [
  { key: 'platinum', name: 'Platinum', detail: 'Premium seating, meal included', price: 95 },
  { key: 'gold', name: 'Gold', detail: 'Comfortable seating', price: 75 },
];

export const webViewPages = {
  fomema: { url: 'https://eservices.imi.gov.my/myimms/FomemaStatus', title: '🏥 FOMEMA Status Check', icon: '🏥' },
  visa: { url: 'https://eservices.imi.gov.my/myimms/VPAStsInq?MAD_DOC_NO=&MAD_DOC_CTRY_CD=BGD&search=CARIAN&lang=en', title: '🛂 Visa Status Inquiry', icon: '🛂' },
  mydigital: { url: 'https://malaysiadigital.mdec.my/apply', title: '💻 Malaysia Arrival Card', icon: '💻' },
  passport: { url: 'https://www.expatservicesmy.com/ESKLPublicportal/Appointment/BookAppointment', title: '📔 Passport Appointment', icon: '📔' },
  esim: { url: 'https://www.celcomdigi.com/roaming/tourist-sim#roaming-passes', title: '📶 MY e-SIM', icon: '📶' },
  train: { url: 'https://online.ktmb.com.my/', title: '🚂 KTMB Train Ticket', icon: '🚂' },
  // YOYO (yoyo.my) used to be listed here too, but its WebView kept
  // failing to load and getting stuck in the "Reconnecting…" retry loop
  // below - it's been dropped as a partner and replaced with Bus Online
  // Ticket below.
  'bus-redbus': { url: 'https://www.redbus.my/', title: '🚌 redBus Ticket', icon: '🚌' },
  'bus-busonlineticket': { url: 'https://www.busonlineticket.com/', title: '🚌 Bus Online Ticket', icon: '🚌' },
  'bus-easybook': { url: 'https://www.easybook.com/en-my', title: '🚌 Easybook', icon: '🚌' },
};

// "Find your nearest FOMEMA clinic" (fomema2u.com.my's own clinic locator,
// not the government status-check page above) - shown as an in-page
// toggle button on the FOMEMA webview only (see WebViewScreen.js's
// isFomema/showClinicFinder). Kept as its own constant rather than a
// second webViewPages entry so it never accidentally inherits FOMEMA's
// ACCESS_CLICK_WEBVIEWS charge-on-"search"-click behaviour below - this
// page is just a free clinic directory, nothing on it should ever deduct
// points.
export const FOMEMA_CLINIC_FINDER_URL = 'https://www.fomema2u.com.my/employer-agency/find-your-nearest-clinic/';

// Bus is offered through 3 third-party ticketing sites, picked from a grid
// (see BusPickerScreen) rather than a single tile - each option below maps
// straight to a webViewPages key above. (Not to be confused with
// busOptions above, the mock schedule data for the old in-app bus
// inquiry flow.)
export const busTicketPartners = [
  { key: 'bus-redbus', name: 'redBus Ticket', icon: '🚍', accent: '#D32F2F', bg: '#FFEBEE', tagline: 'redbus.my' },
  { key: 'bus-busonlineticket', name: 'Bus Online Ticket', icon: '🚌', accent: '#1565C0', bg: '#E3F2FD', tagline: 'busonlineticket.com' },
  { key: 'bus-easybook', name: 'Easybook', icon: '🎫', accent: '#00897B', bg: '#E0F2F1', tagline: 'easybook.com' },
];

// Every bus partner key from busTicketPartners above, kept as its own
// array so WebViewScreen can key its shared "third-party bus ticketing
// site" behaviour (stay-in-app navigation, install-app popup blocking,
// browser user agent, indefinite retry-on-failure) off any current or
// future bus partner without listing keys by name there.
export const BUS_TICKET_WEBVIEW_KEYS = busTicketPartners.map((p) => p.key);

// Recharge/Internet Package exchange rate, per non-Malaysia country - this
// is deliberately separate from Mobile Banking's rate (rates.mobileBanking)
// and from the Remittance per-country rates: recharge margins differ from
// those other channels, so admin needs to set this one independently (see
// RATE_FIELDS in AdminHomeScreen.js -> ratesService.updateRate). Falls back
// to 1 (no conversion) for a country with no rate configured.
export const RECHARGE_RATE_KEYS = {
  BD: 'rechargeBD',
  IN: 'rechargeIN',
  NP: 'rechargeNP',
  ID: 'rechargeID',
  PK: 'rechargePK',
  MM: 'rechargeMM',
  PH: 'rechargePH',
  KH: 'rechargeKH',
};

/** 1 MYR = <rate> <local currency> for Recharge/Internet, from the live rates doc. */
export function getRechargeRate(countryCode, rates) {
  const key = RECHARGE_RATE_KEYS[countryCode];
  const rate = key && rates ? rates[key] : null;
  return rate > 0 ? rate : 1;
}

/**
 * Converts a Recharge/Internet Package amount (in the destination
 * country's local currency, e.g. BDT) into the points (= MYR, 1 point = 1
 * MYR, same as everywhere else in the app) that will be shown/deducted for
 * it. Malaysia orders are already in MYR/points, so this is a no-op for
 * country 'MY' (or no country selected yet).
 */
export function amountToPoints(amount, countryCode, rates) {
  const num = Number(amount) || 0;
  if (!countryCode || countryCode === 'MY') return num;
  const rate = getRechargeRate(countryCode, rates);
  return rate > 0 ? num / rate : num;
}

// FOMEMA/Visa: free to open, but the government page's own "Carian"/
// "Search" button charges points - see webviewAccessService.ensureWebviewAccess,
// which is what actually reads/writes against a user's wallet.
//
// The three *_COST constants below (WEBVIEW_ACCESS_COST,
// WEBVIEW_SUBMIT_COST, PAYMENT_SUCCESS_COST) are only the fallback values
// used before settings/pricing has loaded - admin can edit the live price
// from Admin > Pricing > Point Feature Costs (settingsService.js). Every
// actual lock/charge/warning reads AppContext.pointCosts, not these
// constants directly - see AppContext.openWebView.
export const WEBVIEW_ACCESS_COST = 2; // points (1 point = MYR 1)

// After a charged FOMEMA/Visa search, further searches on the same key are
// free until this many hours have passed since that charge (then the next
// search charges again). This is only the fallback used before
// settings/pricing has loaded - admin can edit the live value from
// Admin > Pricing > Access Window (settingsService.js,
// pricing.webviewAccessWindowHours). See webviewAccessService.ensureWebviewAccess.
export const WEBVIEW_ACCESS_WINDOW_HOURS = 1;

// FOMEMA and Visa are free to open - the charge fires when the user taps
// the government page's own "Carian"/"Search" button, unless they're still
// inside the free access window from an earlier charge on the same key
// (see WEBVIEW_ACCESS_WINDOW_HOURS above). See WEBVIEW_ACCESS_CLICK_TRIGGERS
// + the injected click-listener in WebViewScreen, and
// AppContext.confirmWebviewAccess.
export const ACCESS_CLICK_WEBVIEWS = ['fomema', 'visa'];
export const WEBVIEW_ACCESS_CLICK_TRIGGERS = {
  fomema: ['carian', 'search'],
  visa: ['carian', 'search'],
};

// MY Digital and Passport are booking/application flows rather than
// same-session status checks, so charging on open would bill someone who
// never finishes the form. Instead these are free to open, and the charge
// only fires once the user actually taps the page's own action button
// (see WEBVIEW_SUBMIT_TRIGGERS + the injected click-listener in
// WebViewScreen, and webviewAccessService.chargeWebviewSubmission).
export const WEBVIEW_SUBMIT_COST = 2; // points (1 point = MYR 1)
export const SUBMIT_CHARGED_WEBVIEWS = ['mydigital', 'passport'];

// Lowercase substrings the injected click-listener looks for in the
// button/element that was tapped, per webview key - keep these to the
// shortest distinctive word so the match survives multi-language button
// labels (e.g. Passport's real button reads "Submit / জমা দিন").
export const WEBVIEW_SUBMIT_TRIGGERS = {
  mydigital: ['proceed'],
  passport: ['submit'],
};

// Bus (redBus/Bus Online Ticket/Easybook) and MY e-SIM are real ticket/SIM
// purchases on the third-party site itself - the user pays redbus.my /
// busonlineticket.com / easybook.com / CelcomDigi directly, and MySheba
// only deducts a service fee in points, and only once that payment has
// actually gone through. Unlike the flows above, these are NEVER free to
// open: someone who gets past the door has everything they need to
// complete a real purchase on the third-party site regardless of what
// MySheba does afterwards, so if we can't collect the points, we don't
// let them in at all (see checkPaymentEntryAccess in
// paymentWebviewService.js, called from AppContext.openWebView before
// navigation). The actual deduction fires once payment success is
// detected (or self-confirmed) inside WebViewScreen - see
// PAYMENT_SUCCESS_URL_MARKERS below and confirmPaymentSuccess in
// AppContext.js.
export const PAYMENT_CHARGED_WEBVIEWS = [...BUS_TICKET_WEBVIEW_KEYS, 'esim', 'train'];
export const PAYMENT_SUCCESS_COST = 3; // points (1 point = MYR 1) - service fee per successful purchase

// Lowercase substrings checked against the WebView's current URL after
// every navigation (see onNavigationStateChange in WebViewScreen). These
// are generic "we landed on a receipt/confirmation page" markers rather
// than site-specific paths, since third-party checkout URLs change
// without notice - kept broad on purpose. A manual "I've completed my
// payment" button (see isPaymentFlow in WebViewScreen) is always shown
// as a fallback in case a real success page doesn't match any of these.
export const PAYMENT_SUCCESS_URL_MARKERS = [
  'success', 'thank-you', 'thankyou', 'thank_you', 'confirmation',
  'confirmed', 'receipt', 'order-complete', 'ordercomplete',
  'booking-success', 'bookingsuccess', 'payment-success', 'paymentsuccess',
  'e-ticket', 'eticket', 'ticket-details', 'ticketdetails',
];
