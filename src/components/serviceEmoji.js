// Emoji for the service grid, matching the reference screenshot.
//
// The grid used line icons drawn in each service's colour. The reference is
// the opposite: a plain white card with an outline, and a colour emoji doing
// all the work. Emoji also solve the problem the line set had - a glyph for
// "Malaysia Arrival Card" or "FOMEMA" that reads at 22px is close to
// impossible to draw, where a laptop and a hospital are instantly obvious.
//
// Kept apart from ServiceIcon rather than replacing it: the sidebar and the
// KYC badge still want a stroked icon that takes a colour.
export const SERVICE_EMOJI = {
  // exactly as the reference draws them
  recharge: '📱',
  mobilebanking: '🏦',
  internet: '📡',
  remittance: '💸',
  bus: '🚌',
  train: '🚂',
  flight: '✈️',
  fomema: '🏥',
  visa: '🛂',
  mydigital: '💻',
  passport: '📙',
  moreFeaturesTile: '✨',

  // the rest of the catalogue, in the same spirit
  billpayment: '🧾',
  rechargePin: '🎟️',
  entertainment: '🎬',
  salary: '💰',
  documents: '📂',

  // staff and management tiles
  topup: '💵',
  history: '🧾',
  users: '👥',
  reports: '📊',
  settings: '⚙️',
  orders: '📦',
  support: '🎧',
  finance: '🏧',
  adminFeatures: '🛠️',
  dealerFeatures: '🛠️',
  resellerFeatures: '🛠️',
  adminTopup: '💵',
};

export const FALLBACK_EMOJI = '🔹';

export function serviceEmoji(key) {
  return SERVICE_EMOJI[key] || FALLBACK_EMOJI;
}
