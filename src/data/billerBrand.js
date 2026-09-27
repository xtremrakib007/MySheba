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
};

/**
 * Brand for a biller name, falling back to the recharge operator set before
 * the generic initials badge - a postpaid bill for CelcomDigi should look
 * like CelcomDigi, and that logo is already bundled.
 */
export function getBillerBrand(name) {
  return billerBrand[name] || getOperatorBrand(name);
}
