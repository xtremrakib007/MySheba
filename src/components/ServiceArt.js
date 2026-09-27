import React from 'react';
import Svg, { Rect, Circle, Path, Polygon, Line, Ellipse, G } from 'react-native-svg';

// Drawn service icons.
//
// The grid used emoji, which meant the artwork was whatever font the phone
// happened to ship: blurry where it was scaled up (the same bitmap problem
// the flags had), a different style on every Android version, and nothing
// the app could actually art-direct. These are paths on one 48x48 grid, so
// they are crisp at any size and identical on every device.
//
// One flat palette across the set, and two or three colours per icon. That
// is what makes a set read as a set - the emoji never did, because each one
// came from a different illustrator.

const C = {
  blue: '#2F80ED',
  blueDark: '#1B4F9C',
  blueLight: '#A9CEF7',
  bluePale: '#DCEAFB',
  navy: '#1B3A6B',
  green: '#27AE60',
  greenLight: '#9BE0B8',
  gold: '#F2B705',
  goldLight: '#FFE08A',
  red: '#EB5757',
  purple: '#9B51E0',
  purpleLight: '#D9BBF5',
  grey: '#B9C6D4',
  greyLight: '#E3EAF2',
  white: '#FFFFFF',
};

// Shorthand keeps each icon to a readable handful of shapes.
//  rather than : a parameter named h shadows the JSX factory under
// a jsxFactory:"h" transform, which is how these get rendered for review.
const r = (x, y, w, ht, fill, rx = 0) => <Rect x={x} y={y} width={w} height={ht} rx={rx} fill={fill} />;
const c = (cx, cy, rad, fill) => <Circle cx={cx} cy={cy} r={rad} fill={fill} />;
const p = (d, fill) => <Path d={d} fill={fill} />;
const stroke = (d, col, w = 2.6) => (
  <Path d={d} stroke={col} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);

const ART = {
  // ---- money ----
  recharge: () => (<>
    {r(15, 5, 18, 38, C.navy, 4)}
    {r(17.5, 9, 13, 26, C.blueLight, 2)}
    {c(24, 39, 1.8, C.white)}
    {stroke('M35 14a9 9 0 0 1 0 12', C.green, 2.4)}
    {stroke('M38.5 10a14 14 0 0 1 0 20', C.greenLight, 2.4)}
  </>),

  topup: () => (<>
    {r(5, 13, 38, 24, C.blue, 4)}
    {r(5, 19, 38, 5, C.blueDark)}
    {r(9, 29, 9, 3, C.blueLight, 1.5)}
    {c(35, 31, 7, C.green)}
    {stroke('M35 27.5v7M31.5 31h7', C.white, 2.4)}
  </>),

  remittance: () => (<>
    {r(4, 13, 30, 19, C.greenLight, 3)}
    {r(4, 13, 30, 19, 'none', 3)}
    {c(19, 22.5, 5, C.green)}
    {stroke('M19 19.5v6M17 21.5h4M17 23.5h4', C.white, 1.6)}
    {p('M33 36l11-6-11-6v4H22v4h11z', C.blue)}
  </>),

  mobilebanking: () => (<>
    {p('M24 6L43 16H5L24 6z', C.blue)}
    {r(9, 19, 4, 15, C.blueLight, 1)}
    {r(17, 19, 4, 15, C.blueLight, 1)}
    {r(27, 19, 4, 15, C.blueLight, 1)}
    {r(35, 19, 4, 15, C.blueLight, 1)}
    {r(5, 36, 38, 5, C.navy, 2)}
    {c(24, 12, 2.4, C.white)}
  </>),

  billpayment: () => (<>
    {p('M9 5h30v38l-5-3-5 3-5-3-5 3-5-3-5 3V5z', C.white)}
    {p('M9 5h30v38l-5-3-5 3-5-3-5 3-5-3-5 3V5z', C.bluePale)}
    {r(14, 13, 20, 3, C.blue, 1.5)}
    {r(14, 20, 14, 3, C.blueLight, 1.5)}
    {r(14, 27, 17, 3, C.blueLight, 1.5)}
    {c(34, 35, 6, C.green)}
    {stroke('M31 35l2.2 2.2L37 33', C.white, 2.2)}
  </>),

  rechargePin: () => (<>
    {p('M5 14h38v7a3 3 0 0 0 0 6v7H5v-7a3 3 0 0 0 0-6v-7z', C.gold)}
    {r(21, 17, 2.5, 4, C.white, 1)}
    {r(21, 24, 2.5, 4, C.white, 1)}
    {r(21, 31, 2.5, 4, C.white, 1)}
    {r(28, 21, 9, 2.6, C.white, 1.3)}
    {r(28, 26.5, 6, 2.6, C.white, 1.3)}
  </>),

  salary: () => (<>
    {p('M7 16c0-3 2-5 5-5h24c3 0 5 2 5 5v20c0 3-2 5-5 5H12c-3 0-5-2-5-5V16z', C.blue)}
    {p('M7 16c0-3 2-5 5-5h17v30H12c-3 0-5-2-5-5V16z', C.blueDark)}
    {c(34, 26, 6.5, C.gold)}
    {stroke('M34 22.5v7M31.8 24.5h4M31.8 27.5h4', C.white, 1.7)}
  </>),

  walletTransfer: () => (<>
    {c(24, 24, 18, C.bluePale)}
    {p('M13 19h17v-4l7 6-7 6v-4H13v-4z', C.blue)}
    {p('M35 29H18v-4l-7 6 7 6v-4h17v-4z', C.green)}
  </>),

  finance: () => (<>
    {p('M19 9h10l-2.5 5h-5L19 9z', C.navy)}
    {p('M21.5 14h5c7 0 12 6 12 13s-5 12-14.5 12S9.5 34 9.5 27s5-13 12-13z', C.gold)}
    {stroke('M24 20v14M20.5 23.5h7M20.5 29.5h7', C.white, 2.3)}
  </>),

  pricing: () => (<>
    {p('M6 6h18l18 18-18 18L6 24V6z', C.purple)}
    {c(14, 14, 3.4, C.white)}
    {stroke('M24 26l6 6', C.purpleLight, 2.4)}
  </>),

  // ---- travel ----
  bus: () => (<>
    {r(6, 8, 36, 25, C.gold, 5)}
    {r(9.5, 12, 12, 9, C.blueLight, 2)}
    {r(26.5, 12, 12, 9, C.blueLight, 2)}
    {r(6, 25, 36, 4, C.navy)}
    {c(14, 36, 4.5, C.navy)}
    {c(34, 36, 4.5, C.navy)}
    {c(14, 36, 1.8, C.greyLight)}
    {c(34, 36, 1.8, C.greyLight)}
  </>),

  train: () => (<>
    {p('M11 8h26v20a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V8z', C.blue)}
    {r(14.5, 12, 8, 8, C.blueLight, 1.5)}
    {r(25.5, 12, 8, 8, C.blueLight, 1.5)}
    {c(17, 27, 2.2, C.gold)}
    {c(31, 27, 2.2, C.gold)}
    {stroke('M16 35l-4 6M32 35l4 6M9 43h30', C.navy, 2.6)}
  </>),

  flight: () => (<>
    {p('M42 22.5c1.2 0 2 .9 2 2s-.8 2-2 2l-11 .8-7.5 12.6c-.3.5-.8.8-1.4.8h-2.6l3.4-13-7.6.6-3 4.3c-.3.4-.7.6-1.2.6H8l2.4-7.9L8 17.4h3.1c.5 0 .9.2 1.2.6l3 4.3 7.6.6-3.4-13h2.6c.6 0 1.1.3 1.4.8L31 22.3l11 .2z', C.blue)}
  </>),

  // ---- documents / immigration ----
  passport: () => (<>
    {r(9, 5, 30, 38, C.navy, 3)}
    {r(12.5, 5, 26.5, 38, C.blueDark, 3)}
    {c(26, 18, 7, 'none')}
    {stroke('M26 11a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', C.goldLight, 1.8)}
    {stroke('M26 11c-3 3.5-3 10.5 0 14M19 18h14', C.goldLight, 1.5)}
    {r(19, 30, 14, 2.4, C.goldLight, 1.2)}
    {r(21.5, 35, 9, 2.4, C.goldLight, 1.2)}
  </>),

  visa: () => (<>
    {r(4, 11, 40, 26, C.blue, 4)}
    {r(4, 11, 40, 26, 'none', 4)}
    {c(15, 24, 7.5, C.white)}
    {stroke('M15 16.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z', C.blue, 1.4)}
    {stroke('M15 16.5c-3 4-3 11 0 15M7.5 24h15', C.blue, 1.3)}
    {r(27, 19, 13, 3, C.white, 1.5)}
    {r(27, 26, 9, 3, C.blueLight, 1.5)}
  </>),

  mydigital: () => (<>
    {r(8, 9, 32, 22, C.navy, 2.5)}
    {r(10.5, 11.5, 27, 17, C.blueLight, 1.5)}
    {p('M31 15.5l-3.5 7-6.5-1.5-1.5 3 5.5 2.5 1.5-3 5 1 1.5-3-2-6z', C.blue)}
    {r(5, 33, 38, 4, C.grey, 2)}
  </>),

  fomema: () => (<>
    {r(8, 11, 32, 30, C.white, 3)}
    {r(8, 11, 32, 30, C.bluePale, 3)}
    {p('M24 4l14 7H10l14-7z', C.blue)}
    {r(21, 18, 6, 17, C.red, 1.5)}
    {r(15.5, 23.5, 17, 6, C.red, 1.5)}
  </>),

  documents: () => (<>
    {p('M5 12a3 3 0 0 1 3-3h10l4 4h15a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V12z', C.blue)}
    {p('M5 20h38v16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V20z', C.blueLight)}
  </>),

  myDocuments: () => (<>
    {p('M11 5h17l9 9v29a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', C.white)}
    {p('M11 5h17l9 9v29a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', C.bluePale)}
    {p('M28 5l9 9h-9V5z', C.blueLight)}
    {r(14, 21, 19, 2.6, C.blue, 1.3)}
    {r(14, 27, 19, 2.6, C.blueLight, 1.3)}
    {r(14, 33, 12, 2.6, C.blueLight, 1.3)}
  </>),

  // ---- people ----
  myAccount: () => (<>
    {c(24, 24, 19, C.bluePale)}
    {c(24, 19, 7, C.blue)}
    {p('M11 39a13 13 0 0 1 26 0 19 19 0 0 1-26 0z', C.blue)}
  </>),

  profile: () => (<>
    {r(4, 10, 40, 28, C.blue, 4)}
    {r(4, 10, 40, 8, C.blueDark, 4)}
    {c(16, 27, 5, C.white)}
    {p('M8 37a8 8 0 0 1 16 0H8z', C.white)}
    {r(28, 24, 12, 2.8, C.white, 1.4)}
    {r(28, 30, 8, 2.8, C.blueLight, 1.4)}
  </>),

  userManagement: () => (<>
    {c(17, 18, 6.5, C.blue)}
    {p('M6 34a11 11 0 0 1 22 0 14 14 0 0 1-22 0z', C.blue)}
    {c(33, 20, 5, C.blueLight)}
    {p('M24 33a9 9 0 0 1 18 0 12 12 0 0 1-18 0z', C.blueLight)}
  </>),

  verificationManagement: () => (<>
    {r(4, 10, 40, 28, C.white, 4)}
    {r(4, 10, 40, 28, C.bluePale, 4)}
    {c(16, 22, 5.5, C.blue)}
    {p('M7 33a9 9 0 0 1 18 0H7z', C.blue)}
    {r(29, 19, 11, 2.6, C.blueLight, 1.3)}
    {r(29, 25, 8, 2.6, C.blueLight, 1.3)}
    {c(36, 34, 8, C.green)}
    {stroke('M32.5 34l2.6 2.6L40 32', C.white, 2.4)}
  </>),

  // ---- support / admin ----
  support: () => (<>
    {stroke('M10 28v-4a14 14 0 0 1 28 0v4', C.blue, 3.2)}
    {r(5, 26, 9, 13, C.blue, 4)}
    {r(34, 26, 9, 13, C.blue, 4)}
    {p('M38.5 39c0 3-3 5-8 5', 'none')}
    {stroke('M38.5 39.5c0 3-3.5 4.5-8 4.5', C.blueLight, 2.6)}
  </>),

  inquiries: () => (<>
    {p('M6 12a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H20l-9 8v-8h-1a4 4 0 0 1-4-4V12z', C.blue)}
    {r(13, 16, 22, 3, C.white, 1.5)}
    {r(13, 23, 14, 3, C.blueLight, 1.5)}
  </>),

  adminAnalytics: () => (<>
    {r(6, 8, 36, 34, C.white, 3)}
    {r(6, 8, 36, 34, C.bluePale, 3)}
    {r(12, 24, 6, 12, C.blue, 1.5)}
    {r(21, 18, 6, 18, C.green, 1.5)}
    {r(30, 13, 6, 23, C.gold, 1.5)}
  </>),

  reports: () => (<>
    {p('M11 5h17l9 9v29a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', C.bluePale)}
    {p('M28 5l9 9h-9V5z', C.blueLight)}
    {r(14, 30, 4.5, 8, C.blue, 1.2)}
    {r(21.5, 25, 4.5, 13, C.green, 1.2)}
    {r(29, 20, 4.5, 18, C.gold, 1.2)}
  </>),

  history: () => (<>
    {c(24, 24, 18, C.bluePale)}
    {stroke('M24 12a12 12 0 1 1-11.5 8.6', C.blue, 3)}
    {stroke('M12 13v6h6', C.blue, 3)}
    {stroke('M24 17v8l6 3', C.navy, 2.8)}
  </>),

  adminFeatures: () => (<>
    {r(6, 6, 15, 15, C.blue, 3)}
    {r(27, 6, 15, 15, C.blueLight, 3)}
    {r(6, 27, 15, 15, C.blueLight, 3)}
    {r(27, 27, 15, 15, C.green, 3)}
  </>),

  businessProfile: () => (<>
    {r(7, 14, 20, 28, C.blue, 2)}
    {r(27, 22, 14, 20, C.blueLight, 2)}
    {r(11, 19, 4, 4, C.white, 1)}
    {r(19, 19, 4, 4, C.white, 1)}
    {r(11, 27, 4, 4, C.white, 1)}
    {r(19, 27, 4, 4, C.white, 1)}
    {r(31, 27, 4, 4, C.white, 1)}
    {r(31, 34, 4, 4, C.white, 1)}
  </>),

  internet: () => (<>
    {c(24, 24, 17, C.blue)}
    {stroke('M24 7c-5 5-5 29 0 34M24 7c5 5 5 29 0 34', C.white, 1.8)}
    {stroke('M8 18h32M8 30h32', C.white, 1.8)}
    {stroke('M24 7a17 17 0 1 0 0 34 17 17 0 0 0 0-34z', C.white, 1.8)}
  </>),

  entertainment: () => (<>
    {r(5, 12, 38, 26, C.navy, 3)}
    {r(5, 12, 38, 6, C.blueDark)}
    {p('M20 22l11 6-11 6V22z', C.white)}
  </>),

  pending: () => (<>
    {c(24, 24, 18, C.goldLight)}
    {stroke('M24 12a12 12 0 1 1-8.5 3.5', C.gold, 3)}
    {stroke('M24 16v9l6 3.5', C.navy, 2.8)}
    {c(37, 13, 5, C.red)}
  </>),

  featureAccess: () => (<>
    {r(10, 21, 28, 21, C.blue, 4)}
    {stroke('M17 21v-5a7 7 0 0 1 14 0v5', C.navy, 3.4)}
    {c(24, 30, 3.4, C.white)}
    {r(22.6, 31, 2.8, 6, C.white, 1.4)}
  </>),

  gridManagement: () => (<>
    {r(6, 6, 15, 15, C.blueLight, 3)}
    {r(27, 6, 15, 15, C.blue, 3)}
    {r(6, 27, 15, 15, C.blue, 3)}
    {r(27, 27, 15, 15, C.greyLight, 3)}
    {stroke('M30 34.5h9M34.5 30v9', C.blue, 2.6)}
  </>),

  banners: () => (<>
    {r(5, 10, 38, 28, C.bluePale, 3)}
    {c(16, 20, 4, C.gold)}
    {p('M9 34l10-11 7 8 6-5 7 8H9z', C.green)}
    {r(5, 10, 38, 28, 'none', 3)}
  </>),

  announcements: () => (<>
    {p('M10 20h7l16-9v26l-16-9h-7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3z', C.blue)}
    {stroke('M38 18a9 9 0 0 1 0 12', C.green, 2.6)}
    {r(13, 31, 6, 10, C.blueLight, 2)}
  </>),

  apiManagement: () => (<>
    {c(12, 14, 5, C.blue)}
    {c(36, 14, 5, C.green)}
    {c(24, 34, 5, C.gold)}
    {stroke('M12 19v6h24v-6M24 25v4', C.grey, 2.6)}
  </>),

  moreFeaturesTile: () => (<>
    {p('M24 6l3.6 9.4L37 19l-9.4 3.6L24 32l-3.6-9.4L11 19l9.4-3.6L24 6z', C.gold)}
    {p('M37 30l1.8 4.7L43.5 36.5l-4.7 1.8L37 43l-1.8-4.7L30.5 36.5l4.7-1.8L37 30z', C.goldLight)}
  </>),
};

// Keys that mean the same thing to a person, so they get the same drawing.
const ALIASES = {
  adminSupport: 'support',
  staffSupport: 'support',
  kyc: 'verificationManagement',
  users: 'userManagement',
  dealerFeatures: 'adminFeatures',
  resellerFeatures: 'adminFeatures',
  moreFeatures: 'moreFeaturesTile',
  more: 'moreFeaturesTile',
  adminTopup: 'topup',
  topups: 'topup',
  transferPoints: 'walletTransfer',
  myaccount: 'myAccount',
  account: 'myAccount',
  salaryDashboard: 'salary',
  documentsTile: 'documents',
  all: 'history',
  orders: 'history',
  rates: 'pricing',
  payments: 'topup',
  staffReports: 'reports',
  staffInquiries: 'inquiries',
  operations: 'adminFeatures',
  system: 'adminFeatures',
};

export function hasServiceArt(key) {
  const k = ALIASES[key] || key;
  return !!ART[k];
}

/** A drawn icon for a service key, or null when there is no drawing yet. */
export default function ServiceArt({ name, size = 30 }) {
  const key = ALIASES[name] || name;
  const Draw = ART[key];
  if (!Draw) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G><Draw /></G>
    </Svg>
  );
}
