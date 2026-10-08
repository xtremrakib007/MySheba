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
  PBAPP: { logo: { uri: 'https://www.google.com/s2/favicons?domain=pba.com.my&sz=128' }, color: '#0072BC', initials: 'PB' },
  SAJ: { logo: { uri: 'https://www.google.com/s2/favicons?domain=saj.com.my&sz=128' }, color: '#00833E', initials: 'SJ' },
  // Malaysia - internet and TV
  TIME: { logo: require('../../assets/billers/time.png'), color: '#EC268F', initials: 'TI' },
  Astro: { logo: require('../../assets/billers/astro.jpg'), color: '#EC008C', initials: 'AS' },
  Maxis: { logo: require('../../assets/billers/maxis.png'), color: '#00A94F', initials: 'MX' },
  'Telekom Malaysia (TM)': { logo: null, color: '#00539F', initials: 'TM' },
  // The JomPAY rail itself, which is a biller row of one: the customer types
  // the biller code off their bill rather than picking a biller, so the mark
  // on that row is the one they are matching against the bill in their hand.
  JomPAY: { logo: require('../../assets/billers/jompay.png'), color: '#1B2A6B', initials: 'JP' },
  // Malaysia - the state water boards and the two east-Malaysian grids
  'Sabah Electricity (SESB)': { logo: null, color: '#E01F26', initials: 'SB' },
  'Sarawak Energy (SESCO)': { logo: null, color: '#0F8A4C', initials: 'SC' },
  'SAJ Ranhill Air Johor': { logo: { uri: 'https://www.google.com/s2/favicons?domain=ranhill.com.my&sz=128' }, color: '#00833E', initials: 'SJ' },
  'Syarikat Air Melaka (SAMB)': { logo: null, color: '#0057A8', initials: 'SM' },
  'Kuching Water Board': { logo: { uri: 'https://www.google.com/s2/favicons?domain=kuchingwaterboard.com&sz=128' }, color: '#0E7C86', initials: 'KW' },
  'Syarikat Air Darul Aman (SADA)': { logo: null, color: '#1C6FB8', initials: 'SD' },
  'Syarikat Air Terengganu (SATU)': { logo: null, color: '#143C8C', initials: 'TG' },
  'Syarikat Air Negeri Sembilan (SAINS)': { logo: null, color: '#E8821E', initials: 'SN' },
  'Air Kelantan': { logo: { uri: 'https://www.google.com/s2/favicons?domain=airkelantan.com.my&sz=128' }, color: '#0B7A3B', initials: 'AK' },
  'Sibu Water Board': { logo: { uri: 'https://www.google.com/s2/favicons?domain=sibuwaterboard.gov.my&sz=128' }, color: '#1CA8C4', initials: 'SW' },
  'Syarikat Air Perlis (SAP)': { logo: null, color: '#1E63A8', initials: 'SP' },
  'Air Pahang (PAIP)': { logo: null, color: '#1878BE', initials: 'PA' },

  // Nepal
  NEA: { logo: { uri: 'https://www.google.com/s2/favicons?domain=nea.org.np&sz=128' }, color: '#14479B', initials: 'NE' },
  'Nepal Water Supply': { logo: { uri: 'https://www.google.com/s2/favicons?domain=kukl.org.np&sz=128' }, color: '#1B72B8', initials: 'NW' },
  Khanepani: { logo: { uri: 'https://www.google.com/s2/favicons?domain=kukl.org.np&sz=128' }, color: '#0E6BA8', initials: 'KP' },
  Vianet: { logo: { uri: 'https://www.google.com/s2/favicons?domain=vianet.com.np&sz=128' }, color: '#E21B23', initials: 'VN' },
  'Sky Internet': { logo: { uri: 'https://www.google.com/s2/favicons?domain=sky.com.np&sz=128' }, color: '#1B9CD8', initials: 'SI' },
  'Sky TV': { logo: { uri: 'https://www.google.com/s2/favicons?domain=sky.com.np&sz=128' }, color: '#2B3A8C', initials: 'SV' },
  Websurfer: { logo: { uri: 'https://www.google.com/s2/favicons?domain=websurfer.com.np&sz=128' }, color: '#F07C22', initials: 'WS' },
  Arrownet: { logo: { uri: 'https://www.google.com/s2/favicons?domain=arrownet.com.np&sz=128' }, color: '#E4572E', initials: 'AN' },
  'Dish Home': { logo: { uri: 'https://www.google.com/s2/favicons?domain=dishhome.com.np&sz=128' }, color: '#D6202A', initials: 'DH' },
  'Sim TV': { logo: { uri: 'https://www.google.com/s2/favicons?domain=simtv.com.np&sz=128' }, color: '#2E9E4B', initials: 'ST' },
  'Mero TV': { logo: { uri: 'https://www.google.com/s2/favicons?domain=merotv.com.np&sz=128' }, color: '#1D4E9C', initials: 'MT' },

  // Indonesia and the Philippines. One entry each covers every denomination,
  // because getBillerBrand falls back to the longest known name the biller
  // starts with - "PLN Meter 50000 IDR" is still PLN.
  PLN: { logo: { uri: 'https://www.google.com/s2/favicons?domain=pln.co.id&sz=128' }, color: '#1B7FC4', initials: 'PL' },
  'BPJS Insurance': { logo: { uri: 'https://www.google.com/s2/favicons?domain=bpjs-kesehatan.go.id&sz=128' }, color: '#1B9E4B', initials: 'BJ' },
  Meralco: { logo: { uri: 'https://www.google.com/s2/favicons?domain=meralco.com.ph&sz=128' }, color: '#F47B20', initials: 'ML' },

  // Bangladesh. No assets supplied for these yet, so they show a coloured
  // initials badge - each in the board's own colour rather than one grey
  // default, so the list still reads at a glance. Drop a file in
  // assets/billers and point `logo` at it to switch any of them over.
  'Palli Bidyut': { logo: { uri: 'https://www.google.com/s2/favicons?domain=reb.gov.bd&sz=128' }, color: '#1B3A6B', initials: 'PB' },
  DESCO: { logo: { uri: 'https://www.google.com/s2/favicons?domain=desco.gov.bd&sz=128' }, color: '#1A4D9C', initials: 'DE' },
  NESCO: { logo: { uri: 'https://www.google.com/s2/favicons?domain=nesco.gov.bd&sz=128' }, color: '#D6122A', initials: 'NE' },
  DPDC: { logo: { uri: 'https://www.google.com/s2/favicons?domain=dpdc.org.bd&sz=128' }, color: '#123C7A', initials: 'DP' },
  BPDB: { logo: { uri: 'https://www.google.com/s2/favicons?domain=bpdb.gov.bd&sz=128' }, color: '#0F6E3F', initials: 'BP' },
  WZPDCL: { logo: { uri: 'https://www.google.com/s2/favicons?domain=wzpdcl.gov.bd&sz=128' }, color: '#14657A', initials: 'WZ' },
  'Titas Gas': { logo: { uri: 'https://www.google.com/s2/favicons?domain=titasgas.org.bd&sz=128' }, color: '#E8541E', initials: 'TG' },
  'Karnaphuli Gas': { logo: { uri: 'https://www.google.com/s2/favicons?domain=kgdcl.gov.bd&sz=128' }, color: '#1C7FC4', initials: 'KG' },
  'Jalalabad Gas': { logo: { uri: 'https://www.google.com/s2/favicons?domain=jgtdcl.gov.bd&sz=128' }, color: '#D32027', initials: 'JG' },
  'Sundarban Gas': { logo: { uri: 'https://www.google.com/s2/favicons?domain=sgcl.gov.bd&sz=128' }, color: '#28A745', initials: 'SG' },
  'Bakhrabad Gas': { logo: { uri: 'https://www.google.com/s2/favicons?domain=bgdcl.gov.bd&sz=128' }, color: '#5B2D8E', initials: 'BG' },
  'Dhaka WASA': { logo: { uri: 'https://www.google.com/s2/favicons?domain=dwasa.org.bd&sz=128' }, color: '#0072BC', initials: 'DW' },
  'Amber IT': { logo: { uri: 'https://www.google.com/s2/favicons?domain=amberit.com.bd&sz=128' }, color: '#C8102E', initials: 'AI' },
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
  // A denomination is part of the name - "PLN Meter 50000 IDR", "Meralco
  // Load 100" - so fall back to the longest brand the name starts with,
  // rather than giving each voucher its own duplicate entry. Longest first,
  // so "Sky TV" is never mistaken for a "Sky" that does not exist.
  const prefix = Object.keys(billerBrand)
    .filter((k) => base.startsWith(k + ' '))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return billerBrand[prefix];
  return getOperatorBrand(base || name);
}
