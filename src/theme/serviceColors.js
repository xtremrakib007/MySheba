// Fixed colour per service, as the mockup draws the grid - Mobile Top-Up
// green, Internet blue, Bill Payment orange, PIN Generate purple and so on.
// A service keeps its colour whatever role is signed in, so the grid stays
// recognisable when the surrounding palette changes.
//
// Two variants per service rather than one hex. The tile draws the glyph in
// this colour over a 9%-alpha wash of itself, on tileBg - #F8FDFB in light
// and #123338 in dark. A single value cannot clear contrast on both, so the
// hue is fixed and only its lightness moves with the mode. Every value below
// reaches at least 3:1 against the tile it is drawn on (a glyph is a
// graphical object, not body text).
const SERVICE_COLORS = {
  recharge:        { light: '#0E7A43', dark: '#4FD98F' },
  internet:        { light: '#1257B0', dark: '#6BB0FF' },
  billpayment:     { light: '#A85D00', dark: '#FFB86B' },
  pinGenerate:     { light: '#6A2BBF', dark: '#B98CFF' },
  mobilebanking:   { light: '#0F6FA8', dark: '#63C2F0' },
  remittance:      { light: '#0A7A6E', dark: '#4FD9C6' },
  bus:             { light: '#7B3FB5', dark: '#C09BF0' },
  train:           { light: '#1462C4', dark: '#79BBFF' },
  flight:          { light: '#1257B0', dark: '#6BB0FF' },
  visa:            { light: '#0F6FA8', dark: '#63C2F0' },
  fomema:          { light: '#0E7A43', dark: '#4FD98F' },
  mydigital:       { light: '#0A6E78', dark: '#4FCBD4' },
  passport:        { light: '#8A4B00', dark: '#FFC488' },
  moreFeaturesTile:{ light: '#5A6B70', dark: '#A8BEC4' },

  // staff tiles
  dealerFeatures:   { light: '#0A6E78', dark: '#4FCBD4' },
  resellerFeatures: { light: '#8A4B00', dark: '#FFB86B' },
  adminFeatures:    { light: '#1257B0', dark: '#6BB0FF' },
  topup:            { light: '#0E7A43', dark: '#4FD98F' },
  history:          { light: '#5A5F8A', dark: '#A8AEE0' },
  support:          { light: '#1462C4', dark: '#79BBFF' },
  myAccount:        { light: '#0F6FA8', dark: '#63C2F0' },
  profile:          { light: '#6A2BBF', dark: '#B98CFF' },

  // management dashboard tiles (FeatureGrid), coloured the same way
  users:                  { light: '#1257B0', dark: '#6BB0FF' },
  userManagement:         { light: '#1257B0', dark: '#6BB0FF' },
  verificationManagement: { light: '#0A7A6E', dark: '#4FD9C6' },
  transactions:           { light: '#6A2BBF', dark: '#B98CFF' },
  transferPoints:         { light: '#0F6FA8', dark: '#63C2F0' },
  finance:                { light: '#0E7A43', dark: '#4FD98F' },
  payments:               { light: '#0F6FA8', dark: '#63C2F0' },
  rates:                  { light: '#0A6E78', dark: '#4FCBD4' },
  pricing:                { light: '#0A6E78', dark: '#4FCBD4' },
  featureAccess:          { light: '#6A2BBF', dark: '#B98CFF' },
  banners:                { light: '#B0294A', dark: '#FF8FA8' },
  announcements:          { light: '#7B3FB5', dark: '#C09BF0' },
  adminAnalytics:         { light: '#1462C4', dark: '#79BBFF' },
  adminBusinessManagement:{ light: '#0F6FA8', dark: '#63C2F0' },
  operations:             { light: '#5A6B70', dark: '#A8BEC4' },
  system:                 { light: '#5A6B70', dark: '#A8BEC4' },
  inquiries:              { light: '#1462C4', dark: '#79BBFF' },
  topups:                 { light: '#0E7A43', dark: '#4FD98F' },
  pending:                { light: '#A85D00', dark: '#FFB86B' },
  processing:             { light: '#1462C4', dark: '#79BBFF' },
  completed:              { light: '#0E7A43', dark: '#4FD98F' },
  all:                    { light: '#5A5F8A', dark: '#A8AEE0' },
};

export function serviceColor(key, isDark, fallback) {
  const entry = SERVICE_COLORS[key];
  if (!entry) return fallback;
  return isDark ? entry.dark : entry.light;
}

export default SERVICE_COLORS;
