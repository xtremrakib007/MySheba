// Visual identity for each operator shown on the Recharge / Internet
// "Select Operator" step (src/steps/RechargeSteps.js, src/steps/InternetSteps.js).
//
// Most operators below now have a real `logo` (bundled at
// assets/operators/{file}) supplied directly by the business - each is
// that operator's own registered trademark, used here purely to identify
// the operator during a legitimate top-up/recharge transaction, the same
// way any recharge/e-top-up service does. Anything still `logo: null`
// below (Hotlink, Jio, etc.) just hasn't had an asset supplied yet - it
// falls back to a colored initials badge in the meantime.
//
// To add a missing one later, drop the image at assets/operators/{file}
// and point `logo` at it, e.g.:
//   Hotlink: { logo: require('../../assets/operators/hotlink.png'), color: '#ED1C24', initials: 'HL' },
// OperatorCard (src/components/ui.js) automatically prefers `logo` over the
// initials badge whenever one is set, so operators can be swapped over one
// at a time as assets come in - no other code needs to change.
export const operatorBrand = {
  // Bangladesh
  Grameenphone: { logo: require('../../assets/operators/grameenphone.png'), color: '#00A651', initials: 'GP' },
  Robi: { logo: require('../../assets/operators/robi.png'), color: '#E4032E', initials: 'RB' },
  Banglalink: { logo: require('../../assets/operators/banglalink.png'), color: '#F5821F', initials: 'BL' },
  Airtel: { logo: require('../../assets/operators/airtel.png'), color: '#E4022E', initials: 'AT' },
  Teletalk: { logo: require('../../assets/operators/teletalk.jpg'), color: '#C8102E', initials: 'TT' },
  Skitto: { logo: require('../../assets/operators/skitto.png'), color: '#FFCD00', initials: 'SK' },
  // Malaysia
  Celcom: { logo: require('../../assets/operators/celcom.png'), color: '#004990', initials: 'CC' },
  // Celcom and Digi merged into CelcomDigi in 2022 - Digi's old standalone
  // brand is retired, so this key/logo replaces the old `Digi` entry (see
  // src/data/countries.js, which was also renamed to match).
  CelcomDigi: { logo: require('../../assets/operators/celcomdigi.jpg'), color: '#0033A0', initials: 'CD' },
  'U Mobile': { logo: require('../../assets/operators/umobile.jpg'), color: '#8DC63F', initials: 'UM' },
  Hotlink: { logo: require('../../assets/operators/hotlink.png'), color: '#ED1C24', initials: 'HL' },
  XOX: { logo: require('../../assets/operators/xox.jpg'), color: '#D71920', initials: 'XX' },
  Tunetalk: { logo: require('../../assets/operators/tunetalk.png'), color: '#E4022E', initials: 'TU' },
  Unifi: { logo: require('../../assets/operators/unifi.png'), color: '#F5821F', initials: 'UN' },
  Yes: { logo: require('../../assets/operators/yes.png'), color: '#EC008C', initials: 'YS' },
  // India
  Jio: { logo: require('../../assets/operators/jio.png'), color: '#0F1689', initials: 'JI' },
  Vi: { logo: require('../../assets/operators/vi.jpg'), color: '#EE2E67', initials: 'VI' },
  BSNL: { logo: require('../../assets/operators/bsnl.png'), color: '#00693E', initials: 'BS' },
  // Nepal
  Ncell: { logo: require('../../assets/operators/ncell.png'), color: '#7DB928', initials: 'NC' },
  NTC: { logo: require('../../assets/operators/ntc.png'), color: '#004990', initials: 'NT' },
  // Indonesia
  Telkomsel: { logo: require('../../assets/operators/telkomsel.jpg'), color: '#D3122A', initials: 'TS' },
  Indosat: { logo: require('../../assets/operators/indosat.jpg'), color: '#FDB913', initials: 'IO' },
  XL: { logo: require('../../assets/operators/xl.png'), color: '#1279BF', initials: 'XL' },
  // `Smart` was a copy-paste leftover from the Philippines list below (Smart
  // Communications is a PH operator, not Indonesian) - the actual 4th major
  // Indonesian carrier is Smartfren, corrected here with its logo.
  Smartfren: { logo: require('../../assets/operators/smartfren.jpg'), color: '#EE3124', initials: 'SF' },
  Axis: { logo: require('../../assets/operators/axis.png'), color: '#6E2585', initials: 'AX' },
  StarOne: { logo: require('../../assets/operators/starone.png'), color: '#7B2D8E', initials: 'ST' },
  'Tri Indonesia': { logo: require('../../assets/operators/tri.jpg'), color: '#4A154B', initials: '3' },
  // Pakistan
  Jazz: { logo: require('../../assets/operators/jazz.jpg'), color: '#F26522', initials: 'JZ' },
  Zong: { logo: require('../../assets/operators/zong.png'), color: '#6E1E78', initials: 'ZG' },
  Telenor: { logo: require('../../assets/operators/telenor.jpg'), color: '#00A0E1', initials: 'TL' },
  Ufone: { logo: require('../../assets/operators/ufone.png'), color: '#F7941E', initials: 'UF' },
  // Myanmar
  MPT: { logo: require('../../assets/operators/mpt.jpg'), color: '#005BAC', initials: 'MP' },
  Ooredoo: { logo: require('../../assets/operators/ooredoo.png'), color: '#E4022E', initials: 'OO' },
  MEC: { logo: require('../../assets/operators/mectel.png'), color: '#5B2D90', initials: 'MC' },
  'Telenor Myanmar': { logo: require('../../assets/operators/telenor-myanmar.jpg'), color: '#00A0E1', initials: 'TM' },
  Mytel: { logo: require('../../assets/operators/mytel.jpg'), color: '#F47920', initials: 'MY' },
  // Philippines
  Globe: { logo: require('../../assets/operators/globe.jpg'), color: '#00539F', initials: 'GL' },
  Smart: { logo: require('../../assets/operators/smart.png'), color: '#00A650', initials: 'SM' },
  'Smart Bro': { logo: require('../../assets/operators/smartbro.png'), color: '#0072BC', initials: 'SB' },
  TNT: { logo: require('../../assets/operators/tnt.jpg'), color: '#F7941E', initials: 'TN' },
  'Touch Mobile': { logo: require('../../assets/operators/touchmobile.png'), color: '#ED1C24', initials: 'TM' },
  // Cambodia
  // `Smart` in Cambodia is Smart Axiata - a different company from the
  // Philippines' Smart Communications above, despite sharing the name and
  // both previously pointing at the same placeholder entry. Split out with
  // its own logo so each brand shows correctly.
  'Smart Axiata': { logo: require('../../assets/operators/smartaxiata.png'), color: '#00A651', initials: 'SA' },
  Cellcard: { logo: require('../../assets/operators/cellcard.png'), color: '#F99D1C', initials: 'CE' },
  // A wallet rather than a telco: it appears in the Recharge PIN picker, where
  // it is sold as a voucher. No logo file for it, so it gets a badge - three
  // letters because "TO", what the two-character fallback would cut
  // "Touch 'n Go eWallet" down to, reads as nothing at all.
  "Touch 'n Go eWallet": { logo: null, color: '#1A4A9C', initials: 'TNG' },
};

/** Looks up an operator's brand info; falls back to a neutral badge for anything not listed above. */
export function getOperatorBrand(name) {
  return operatorBrand[name] || { logo: null, color: '#607D8B', initials: (name || '?').trim().slice(0, 2).toUpperCase() };
}
