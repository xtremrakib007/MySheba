// Built-in billers and bill categories.
//
// Moved out of the Bill Payment screen so the provider grids can draw the same
// categories and billers the screen offers (src/components/providerGrids.js).
// For Malaysia the screen prefers IIMMPACT's own bills catalogue and this list
// is only its fallback; for Bangladesh this IS Success TopUp's biller list -
// every name here has a code in SUCCESS_TOPUP_BILL_OPERATORS on the server.

// An entry is a name, or { name, amount } when the denomination IS the
// product. Prepaid electricity tokens are sold that way - you buy a 50,000
// IDR PLN token, you do not tell PLN how much your bill was - so those
// billers carry their amount and the amount step shows it rather than
// asking for it.
export const BILLERS = {
  MY: {
    electricity: ['TNB', 'Sabah Electricity (SESB)', 'Sarawak Energy (SESCO)'],
    water: [
      'Air Selangor', 'SAJ Ranhill Air Johor', 'Syarikat Air Melaka (SAMB)',
      'Lembaga Air Perak', 'PBAPP', 'Kuching Water Board',
      'Syarikat Air Darul Aman (SADA)', 'Syarikat Air Terengganu (SATU)',
      'Syarikat Air Negeri Sembilan (SAINS)', 'Air Kelantan',
      'Sibu Water Board', 'Syarikat Air Perlis (SAP)', 'Air Pahang (PAIP)',
    ],
    internet: ['Unifi', 'Telekom Malaysia (TM)', 'TIME', 'Maxis'],
    tv: ['Astro'],
    mobile: ['CelcomDigi', 'Maxis', 'U Mobile', 'Yes'],
    utilities: ['Indah Water'],
    ewallet: ["Touch 'n Go eWallet"],
    // JomPAY is one rail covering thousands of billers, so there is no list to
    // choose from here: the biller code is printed on the customer's own bill
    // and they type it, exactly as they would at a bank's JomPAY screen. The
    // single entry keeps the provider step's shape without pretending to offer
    // a choice.
    jompay: ['JomPAY'],
    // Tax is not a separate IIMMPACT rail. Government/tax bills that expose
    // a JomPAY biller are paid through the same JomPAY flow.
    tax: ['JomPAY'],
  },
  BD: {
    // Prepaid and postpaid are separate billers, not a setting on one: they
    // are different accounts with different numbers at the same board.
    electricity: [
      'Palli Bidyut (Prepaid)', 'Palli Bidyut (Postpaid)',
      'DESCO (Prepaid)', 'DESCO (Postpaid)',
      'NESCO (Prepaid)', 'NESCO (Postpaid)',
      'DPDC (Prepaid)', 'DPDC (Postpaid)',
    ],
    gas: ['Titas Gas', 'Karnaphuli Gas', 'Jalalabad Gas', 'Sundarban Gas', 'Bakhrabad Gas'],
    water: ['Dhaka WASA'],
    internet: ['Amber IT'],
    mobile: ['Grameenphone', 'Robi', 'Banglalink'],
  },
  NP: {
    electricity: ['NEA (Nepal Electricity Authority)'],
    water: ['Nepal Water Supply', 'Khanepani (KUKL)'],
    internet: ['Vianet', 'Sky Internet', 'Websurfer', 'Arrownet'],
    tv: ['Dish Home', 'Sim TV', 'Mero TV', 'Sky TV'],
  },
  ID: {
    electricity: [
      { name: 'PLN Meter 20000 IDR', amount: 20000 },
      { name: 'PLN Meter 50000 IDR', amount: 50000 },
      { name: 'PLN Meter 100000 IDR', amount: 100000 },
      { name: 'PLN Meter 200000 IDR', amount: 200000 },
      { name: 'PLN Meter 500000 IDR', amount: 500000 },
      { name: 'PLN Meter 1000000 IDR', amount: 1000000 },
    ],
    utilities: ['BPJS Insurance'],
  },
  PH: {
    electricity: [
      { name: 'Meralco Load 100', amount: 100 },
      { name: 'Meralco Load 200', amount: 200 },
      { name: 'Meralco Load 300', amount: 300 },
      { name: 'Meralco Load 500', amount: 500 },
      { name: 'Meralco Load 1000', amount: 1000 },
    ],
  },
};


export const BILL_CATEGORIES = [
  { key: 'electricity', label: 'Electricity', art: 'billElectricity' },
  { key: 'water', label: 'Water', art: 'billWater' },
  { key: 'gas', label: 'Gas', art: 'billGas' },
  { key: 'internet', label: 'Internet & Broadband', art: 'billInternet' },
  { key: 'tv', label: 'TV / Astro', art: 'billTv' },
  { key: 'mobile', label: 'Postpaid Mobile', art: 'billMobile' },
  { key: 'utilities', label: 'Other Utilities', art: 'billUtilities' },
  // A wallet reload is not a bill, but it is the same transaction: choose who,
  // say which account, say how much. Here it reuses the whole charged path -
  // pricing, refund on refusal, the audit trail - instead of growing a service.
  //
  // It deliberately is NOT a Recharge operator. Malaysia has prefix detection
  // for 010-019 and Recharge auto-selects the operator and skips the step, so
  // somebody entering their TnG number - an ordinary 012 mobile - would be sent
  // to Hotlink and never offered the choice.
  { key: 'ewallet', label: 'E-Wallet Reload', art: 'walletTransfer' },
  { key: 'jompay', label: 'JomPAY Bill', art: 'jompay' },
  { key: 'tax', label: 'Government / Tax (JomPAY)', art: 'jompay' },
];
