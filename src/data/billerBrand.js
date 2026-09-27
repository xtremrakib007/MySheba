// Visual identity for each biller on the Bill Payment "Select Provider" step
// (src/steps/BillPaymentSteps.js).
//
// Same shape and the same rules as operatorBrand: a real `logo` bundled at
// assets/billers/{file}, each the biller's own registered trademark, used
// here purely to identify who the bill is being paid to. Anything without an
// asset falls back to a coloured initials badge, and OperatorCard prefers the
// logo whenever one is set - so billers can be swapped over one at a time.
//
// Postpaid telcos deliberately have no entry here. getBillerBrand falls
// through to the recharge operator set, so CelcomDigi, U Mobile, Unifi and
// the Bangladeshi operators reuse the logo the recharge flow already ships
// instead of the same file being bundled twice under a second name. Maxis is
// the exception: it sells postpaid and broadband but no prepaid top-up, so it
// is not in the operator set and needs its own asset.
import { getOperatorBrand } from './operatorBrand';

export const billerBrand = {
  // Malaysia - electricity
  TNB: { logo: require('../../assets/billers/tnb.jpg'), color: '#ED1C24', initials: 'TN' },
  // Malaysia - water and sewerage
  'Air Selangor': { logo: require('../../assets/billers/airselangor.jpg'), color: '#2BA6DE', initials: 'AS' },
  'Lembaga Air Perak': { logo: require('../../assets/billers/lembagaairperak.jpg'), color: '#29ABE2', initials: 'AP' },
  'Indah Water': { logo: require('../../assets/billers/indahwater.png'), color: '#1B9E4B', initials: 'IW' },
  PBAPP: { logo: null, color: '#0072BC', initials: 'PB' },
  SAJ: { logo: null, color: '#00833E', initials: 'SJ' },
  // Malaysia - internet and TV
  TIME: { logo: require('../../assets/billers/time.png'), color: '#EC268F', initials: 'TI' },
  Astro: { logo: require('../../assets/billers/astro.jpg'), color: '#EC008C', initials: 'AS' },
  Maxis: { logo: require('../../assets/billers/maxis.png'), color: '#00A94F', initials: 'MX' },

  // Bangladesh. No assets supplied for these yet, so they show a coloured
  // initials badge - each in the board's own colour rather than one grey
  // default, so the list still reads at a glance. Drop a file in
  // assets/billers and point `logo` at it to switch any of them over.
  'Palli Bidyut': { logo: null, color: '#1B3A6B', initials: 'PB' },
  DESCO: { logo: null, color: '#1A4D9C', initials: 'DE' },
  NESCO: { logo: null, color: '#D6122A', initials: 'NE' },
  DPDC: { logo: null, color: '#123C7A', initials: 'DP' },
  BPDB: { logo: null, color: '#0F6E3F', initials: 'BP' },
  WZPDCL: { logo: null, color: '#14657A', initials: 'WZ' },
  'Titas Gas': { logo: null, color: '#E8541E', initials: 'TG' },
  'Karnaphuli Gas': { logo: null, color: '#1C7FC4', initials: 'KG' },
  'Jalalabad Gas': { logo: null, color: '#D32027', initials: 'JG' },
  'Sundarban Gas': { logo: null, color: '#28A745', initials: 'SG' },
  'Bakhrabad Gas': { logo: null, color: '#5B2D8E', initials: 'BG' },
  'Dhaka WASA': { logo: null, color: '#0072BC', initials: 'DW' },
  'Amber IT': { logo: null, color: '#C8102E', initials: 'AI' },
};

/**
 * Brand for a biller name, falling back to the recharge operator set before
 * the generic initials badge - a postpaid bill for CelcomDigi should look
 * like CelcomDigi, and that logo is already bundled.
 */
export function getBillerBrand(name) {
  if (billerBrand[name]) return billerBrand[name];
  // "DESCO (Prepaid)" and "DESCO (Postpaid)" are separate billers but one
  // brand, so a trailing qualifier falls back to the name in front of it
  // rather than to two-letter initials of the same word twice.
  const base = String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (base && billerBrand[base]) return billerBrand[base];
  return getOperatorBrand(base || name);
}
