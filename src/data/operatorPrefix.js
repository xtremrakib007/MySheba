// Which operator a mobile number belongs to, by its national prefix.
//
// This is the ORIGINAL allocation. Number portability means a number can have
// left the network its prefix names, so a detection is a strong guess, not a
// fact - and the cost of being wrong is a top-up sent to the wrong network.
// Where a prefix is genuinely shared, it is left out rather than guessed: an
// undetected number falls back to showing every operator, which is the right
// answer when we do not know.
//
// Numbers are compared in national form (leading 0 kept, 00/+ and the country
// dial code stripped), because that is what the recharge screens collect.

const DIAL_CODES = { BD: '880', MY: '60', IN: '91', NP: '977', ID: '62', PK: '92', MM: '95', PH: '63', KH: '855' };

const PREFIXES = {
  // Bangladesh. 017 is deliberately absent: Grameenphone and Skitto share it,
  // and Skitto is a separate product on the provider side, so a number on 017
  // is shown the grid instead of being sent to whichever we guessed.
  BD: {
    '013': 'Grameenphone',
    '014': 'Banglalink',
    '015': 'Teletalk',
    '016': 'Airtel',
    '018': 'Robi',
    '019': 'Banglalink',
  },
  // Malaysia. Porting here is common, so these are the weakest entries in this
  // file; they are kept together so one correction fixes the lot.
  MY: {
    '010': 'CelcomDigi',
    '011': 'CelcomDigi',
    '012': 'Hotlink',
    '013': 'CelcomDigi',
    '014': 'U Mobile',
    '016': 'CelcomDigi',
    '017': 'Hotlink',
    '018': 'U Mobile',
    '019': 'CelcomDigi',
  },
};

/** A number in national form: digits only, country dial code removed. */
export function nationalNumber(phone, country) {
  let digits = String(phone || '').replace(/[^\d]/g, '');
  const dial = DIAL_CODES[String(country || '').toUpperCase()];
  if (dial && digits.startsWith(dial)) digits = digits.slice(dial.length);
  if (dial && digits.startsWith(`00${dial}`)) digits = digits.slice(dial.length + 2);
  return digits.startsWith('0') ? digits : `0${digits}`;
}

/**
 * The operator a number most likely belongs to, or '' when unknown.
 *
 * `available` is the operator list the screen is offering. A mapping that
 * names an operator this country does not sell is treated as unknown rather
 * than selecting something the customer cannot be shown - otherwise a stale
 * entry here would skip the step and leave nothing selected.
 */
export function operatorForNumber(country, phone, available) {
  const table = PREFIXES[String(country || '').toUpperCase()];
  if (!table) return '';
  const digits = nationalNumber(phone, country);
  if (digits.length < 4) return '';
  const name = table[digits.slice(0, 3)];
  if (!name) return '';
  const list = Array.isArray(available) ? available : [];
  return list.length === 0 || list.includes(name) ? name : '';
}

export const OPERATOR_PREFIXES = PREFIXES;
