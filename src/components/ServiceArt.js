import React from 'react';
import Svg, { Rect, Circle, Path, G } from 'react-native-svg';

// Drawn service icons - one outline set, on a 48x48 grid.
//
// The grid used emoji first, which meant the artwork was whatever font the
// phone happened to ship: blurry where it was scaled up (the same bitmap
// problem the flags had), a different style on every Android version, and
// nothing the app could art-direct. These are paths, so they are crisp at
// any size and identical on every device.
//
// They are line art in ONE colour, passed in, rather than flat multi-colour
// illustrations. That is what makes the set read as a set, and it is what
// lets a tile tint its icon: the grid styles already recolour their labels
// (neon goes white, gradient flips to whatever contrasts with the gradient),
// and an icon with its own fixed palette could only ignore them. Callers
// pass the colour they are using for the label; nothing here decides it.
//
// Keep new icons to a handful of strokes at this weight. An icon that needs
// more detail than that will be mud at 22px, which is the size the sidebar
// draws them at.

const DEFAULT_COLOR = '#3DDC97';
const W = 2.4;

// Shorthand keeps each icon to a readable handful of shapes. `ht` rather
// than `h`: a parameter named h shadows the JSX factory under a
// jsxFactory:"h" transform, which is how these get rendered for review.
const s = (d, c, w = W) => (
  <Path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);
const box = (x, y, w, ht, c, rx = 3, sw = W) => (
  <Rect x={x} y={y} width={w} height={ht} rx={rx} stroke={c} strokeWidth={sw} fill="none" />
);
const ring = (cx, cy, r, c, sw = W) => (
  <Circle cx={cx} cy={cy} r={r} stroke={c} strokeWidth={sw} fill="none" />
);
const dot = (cx, cy, r, c) => <Circle cx={cx} cy={cy} r={r} fill={c} />;

// A sheet of paper with the corner folded over - the base for every
// document-ish icon, so they all fold the same way.
const sheet = (c) => (
  <>
    {s('M13 6h14l8 8v26a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', c)}
    {s('M27 6v8h8', c)}
  </>
);

const ART = {
  // ---- money and connectivity ----
  recharge: (c) => (<>
    {box(11, 5, 17, 38, c, 4)}
    {dot(19.5, 38, 1.5, c)}
    {s('M33 18a8 8 0 0 1 0 12', c)}
    {s('M38 13a15 15 0 0 1 0 22', c)}
  </>),

  internet: (c) => (<>
    {ring(21, 21, 14, c)}
    {s('M7 21h28', c)}
    {s('M21 7c5 5 5 23 0 28M21 7c-5 5-5 23 0 28', c)}
    {ring(37, 37, 5, c)}
    {s('M30 30l3.5 3.5', c)}
  </>),

  rechargePin: (c) => (<>
    {box(6, 14, 36, 20, c, 4)}
    {s('M19 14v3M19 22v4M19 31v3', c)}
    {ring(30, 24, 3.5, c)}
    {s('M34 24h6M38 24v3', c)}
  </>),

  billpayment: (c) => (<>
    {s('M13 6h13l7 7v13', c)}
    {s('M13 6a2 2 0 0 0-2 2v32a2 2 0 0 0 2 2h9', c)}
    {s('M26 6v7h7', c)}
    {s('M17 19h11M17 25h7', c)}
    {ring(33, 33, 8, c)}
    {s('M29.5 33l2.5 2.5 5-5', c)}
  </>),

  mobilebanking: (c) => (<>
    {s('M7 19L24 9l17 10', c)}
    {s('M13 23v12M21 23v12M27 23v12M35 23v12', c)}
    {s('M8 39h32', c)}
  </>),

  remittance: (c) => (<>
    {box(8, 16, 32, 16, c, 3)}
    {ring(24, 24, 4, c)}
    {s('M13 11h17m-4-3.5 4 3.5-4 3.5', c)}
    {s('M35 37H18m4 3.5-4-3.5 4-3.5', c)}
  </>),

  topup: (c) => (<>
    {box(7, 12, 34, 24, c, 4)}
    {s('M7 20h34', c)}
    {s('M30 28h7', c)}
  </>),

  walletTransfer: (c) => (<>
    {box(7, 11, 34, 26, c, 4)}
    {s('M15 20h17m-4-3.5 4 3.5-4 3.5', c)}
    {s('M33 29H16m4 3.5-4-3.5 4-3.5', c)}
  </>),

  salary: (c) => (<>
    {box(7, 14, 34, 20, c, 3)}
    {ring(24, 24, 4.5, c)}
    {s('M24 17v14', c)}
    {s('M12 20v8M36 20v8', c)}
  </>),

  finance: (c) => (<>
    {box(7, 7, 34, 34, c, 4)}
    {s('M15 32v-7M23 32V16M31 32v-11', c)}
  </>),

  pricing: (c) => (<>
    {s('M7 7h14l20 20-14 14L7 21V7z', c)}
    {ring(14.5, 14.5, 2.6, c)}
  </>),

  rates: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M15 20h16m-4-4 4 4-4 4', c)}
    {s('M33 28H17m4-4-4 4 4 4', c)}
  </>),

  payments: (c) => (<>
    {box(6, 12, 36, 24, c, 3)}
    {s('M6 20h36', c)}
    {s('M12 29h8', c)}
    {s('M30 29h6', c)}
  </>),

  superAdminTopup: (c) => (<>
    {box(7, 12, 34, 24, c, 4)}
    {s('M7 20h34', c)}
    {s('M34 25v8M30 29h8', c)}
  </>),

  // ---- travel ----
  bus: (c) => (<>
    {box(11, 8, 26, 27, c, 4)}
    {s('M15 15h18', c)}
    {s('M11 24h26', c)}
    {ring(17, 38, 2.6, c)}
    {ring(31, 38, 2.6, c)}
    {s('M9 17v5M39 17v5', c)}
  </>),

  train: (c) => (<>
    {box(13, 6, 22, 28, c, 4)}
    {box(17, 11, 14, 9, c, 2)}
    {dot(19, 27, 1.6, c)}
    {dot(29, 27, 1.6, c)}
    {s('M10 41h28', c)}
    {s('M18 34l-4 6M30 34l4 6', c)}
  </>),

  flight: (c) => (<>
    {s('M24 5c2.2 0 3.6 3.2 3.6 8.4v5.8l12.4 7.2v3.4l-12.4-3.3v7.2l4.2 3.1v2.6L24 37.8l-7.8 1.6v-2.6l4.2-3.1v-7.2L8 29.8v-3.4l12.4-7.2v-5.8C20.4 8.2 21.8 5 24 5z', c)}
  </>),

  visa: (c) => (<>
    {box(12, 5, 24, 38, c, 4)}
    {ring(24, 20, 7, c)}
    {s('M17 20h14M24 13c3.2 3 3.2 11 0 14M24 13c-3.2 3-3.2 11 0 14', c)}
    {s('M18 35h12', c)}
  </>),

  passport: (c) => (<>
    {box(11, 5, 26, 38, c, 4)}
    {s('M11 36h26', c)}
    {ring(24, 19, 6.5, c)}
    {s('M17.5 19h13M24 12.5c3 3 3 10 0 13M24 12.5c-3 3-3 10 0 13', c)}
  </>),

  fomema: (c) => (<>
    {sheet(c)}
    {s('M24 20v10M19 25h10', c)}
    {s('M18 36h12', c)}
  </>),

  mydigital: (c) => (<>
    {box(9, 10, 30, 21, c, 3)}
    {s('M5 35h38', c)}
    {s('M15 21l9-3.5-2 4 4 1.5-8 3 1.5-2.5-4.5-2.5z', c)}
    {s('M29 19h6M29 25h4', c)}
  </>),

  // ---- documents and people ----
  documents: (c) => (<>
    {sheet(c)}
    {s('M18 22h12M18 28h12M18 34h8', c)}
  </>),

  myDocuments: (c) => (<>
    {s('M18 4h11l7 7v20a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', c)}
    {s('M29 4v7h7', c)}
    {s('M30 37a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V14', c)}
  </>),

  profile: (c) => (<>
    {ring(24, 17, 7.5, c)}
    {s('M10 40c0-7.2 6.3-11 14-11s14 3.8 14 11', c)}
  </>),

  myAccount: (c) => (<>
    {ring(24, 24, 17, c)}
    {ring(24, 19, 5.5, c)}
    {s('M13.5 36c2.2-4.2 6-6.2 10.5-6.2S32.3 31.8 34.5 36', c)}
  </>),

  userManagement: (c) => (<>
    {ring(19, 16, 6.5, c)}
    {s('M7 38c0-6.6 5.4-10 12-10s12 3.4 12 10', c)}
    {ring(34, 15, 5, c)}
    {s('M34 25c4.6 0 7 3 7 8', c)}
  </>),

  verificationManagement: (c) => (<>
    {box(5, 11, 38, 26, c, 3)}
    {ring(16, 21, 4.2, c)}
    {s('M10 31c1.6-3 3.6-4.2 6-4.2s4.4 1.2 6 4.2', c)}
    {s('M28 19h9M28 25h7', c)}
  </>),

  businessProfile: (c) => (<>
    {box(8, 9, 19, 31, c, 3)}
    {box(27, 20, 13, 20, c, 3)}
    {s('M13 16h3M21 16h3M13 23h3M21 23h3M13 30h3M21 30h3M32 27h3M32 34h3', c, 2)}
  </>),

  // ---- support and activity ----
  support: (c) => (<>
    {s('M11 28v-5a13 13 0 0 1 26 0v5', c)}
    {box(6, 25, 8, 11, c, 3)}
    {box(34, 25, 8, 11, c, 3)}
    {s('M38 36c0 4-3 6-7 6h-4', c)}
  </>),

  inquiries: (c) => (<>
    {s('M10 8h28a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H22l-9 7v-7h-3a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z', c)}
    {s('M21 16.5a3.6 3.6 0 1 1 3.6 3.6v2.4', c)}
    {dot(24.6, 26.5, 1.5, c)}
  </>),

  history: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M24 14v10l7 4', c)}
  </>),

  pending: (c) => (<>
    {s('M14 6h20M14 42h20', c)}
    {s('M17 6v5c0 5.5 7 8.5 7 13s-7 7.5-7 13v5', c)}
    {s('M31 6v5c0 5.5-7 8.5-7 13s7 7.5 7 13v5', c)}
  </>),

  reports: (c) => (<>
    {sheet(c)}
    {s('M18 35v-6M24 35v-12M30 35v-9', c)}
  </>),

  adminAnalytics: (c) => (<>
    {box(7, 7, 34, 34, c, 4)}
    {s('M13 31l7-7 5 5 10-11', c)}
    {dot(20, 24, 1.8, c)}
    {dot(25, 29, 1.8, c)}
  </>),

  adAnalytics: (c) => (<>
    {box(6, 11, 30, 30, c, 3)}
    {s('M13 33v-6M21 33V21M29 33v-9', c)}
    {ring(38, 10, 5, c)}
    {s('M36 10h4', c)}
  </>),

  salaryReports: (c) => (<>
    {sheet(c)}
    {s('M18 35v-5M24 35v-9', c)}
    {ring(31, 31, 5, c)}
  </>),

  // ---- admin and system ----
  adminHome: (c) => (<>
    {box(7, 7, 15, 15, c, 3)}
    {box(26, 7, 15, 9, c, 3)}
    {box(26, 20, 15, 21, c, 3)}
    {box(7, 26, 15, 15, c, 3)}
  </>),

  adminFeatures: (c) => (<>
    {s('M24 5l15 6v12c0 9.6-6.4 16.4-15 20-8.6-3.6-15-10.4-15-20V11l15-6z', c)}
    {s('M18 24l4.5 4.5L31 20', c)}
  </>),

  gridManagement: (c) => (<>
    {box(8, 8, 14, 14, c, 3)}
    {box(26, 8, 14, 14, c, 3)}
    {box(8, 26, 14, 14, c, 3)}
    {s('M33 26v14M26 33h14', c)}
  </>),

  featureAccess: (c) => (<>
    {ring(15, 24, 8, c)}
    {s('M23 24h18M37 24v6M31 24v4', c)}
  </>),

  settings: (c) => (<>
    {ring(24, 24, 13, c)}
    {ring(24, 24, 5, c)}
    {s('M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M37.4 10.6l-4.2 4.2M14.8 33.2l-4.2 4.2', c)}
  </>),

  apiManagement: (c) => (<>
    {ring(11, 12, 5, c)}
    {ring(37, 12, 5, c)}
    {ring(24, 37, 5, c)}
    {s('M11 17v7h26v-7M24 24v8', c)}
  </>),

  trustedDevices: (c) => (<>
    {box(13, 5, 22, 38, c, 4)}
    {s('M24 15l7.5 2.7v5.4c0 4.8-3.7 8-7.5 9.1-3.8-1.1-7.5-4.3-7.5-9.1v-5.4L24 15z', c)}
  </>),

  tierPromotions: (c) => (<>
    {s('M16 20L13 5l11 5 11-5-3 15', c)}
    {ring(24, 31, 10, c)}
    {s('M24 26.5l1.9 3.8 4.2.6-3 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3-3 4.2-.6 1.9-3.8z', c)}
  </>),

  banners: (c) => (<>
    {box(6, 10, 36, 28, c, 3)}
    {ring(16, 20, 3.4, c)}
    {s('M9 35l9-9 6 6 5-4 9 8', c)}
  </>),

  announcements: (c) => (<>
    {s('M13 20l17-8v24l-17-8v-8z', c)}
    {s('M13 20h-3a4 4 0 0 0 0 8h3', c)}
    {s('M18 29v7a3.5 3.5 0 0 0 7 0v-4', c)}
    {s('M35 20h5M35 14l4-2M35 26l4 2', c)}
  </>),

  adFeatureControls: (c) => (<>
    {s('M10 15h28M10 24h28M10 33h28', c)}
    {ring(18, 15, 4, c)}
    {ring(30, 24, 4, c)}
    {ring(23, 33, 4, c)}
  </>),

  advertiserManagement: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M16 22l12-6v16l-12-6v-4z', c)}
    {s('M16 22h-1.5a2.5 2.5 0 0 0 0 5H16', c)}
  </>),

  adPackagesManagement: (c) => (<>
    {s('M24 6l16 8v20l-16 8-16-8V14l16-8z', c)}
    {s('M8 14l16 8 16-8M24 22v20', c)}
  </>),

  adPaymentsManagement: (c) => (<>
    {box(5, 12, 38, 23, c, 3)}
    {s('M5 20h38', c)}
    {s('M11 29h8', c)}
    {s('M28 29l7-3.5v7L28 29z', c)}
  </>),

  salarySettings: (c) => (<>
    {ring(18, 18, 8.5, c)}
    {ring(18, 18, 3.2, c)}
    {s('M18 6v3.5M18 26.5V30M6 18h3.5M26.5 18H30M10.2 10.2l2.5 2.5M23.3 23.3l2.5 2.5M25.8 10.2l-2.5 2.5M12.7 23.3l-2.5 2.5', c, 2)}
    {box(24, 28, 18, 12, c, 2, 2.2)}
    {ring(33, 34, 2.8, c, 2)}
  </>),

  entertainment: (c) => (<>
    {box(6, 12, 36, 24, c, 3)}
    {s('M14 12v24M34 12v24', c)}
    {s('M22 19l7 5-7 5z', c)}
  </>),

  moreFeaturesTile: (c) => (<>
    {s('M20 7l3.2 8.8L32 19l-8.8 3.2L20 31l-3.2-8.8L8 19l8.8-3.2L20 7z', c)}
    {s('M35 27l1.7 4.3 4.3 1.7-4.3 1.7L35 39l-1.7-4.3L29 33l4.3-1.7L35 27z', c)}
  </>),

  // ---- bill categories ----
  // Drawn inside a ring, because the Bill Payment step shows them as one row
  // of choices rather than as service tiles.
  billElectricity: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M26 13l-9 13h7l-2 9 9-13h-7l2-9z', c)}
  </>),

  billWater: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M24 13c4 5 7 8.6 7 12.6a7 7 0 0 1-14 0c0-4 3-7.6 7-12.6z', c)}
  </>),

  billGas: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M24 12c1 5-3 6-3 10a3 3 0 0 0 6 0c0-1.4-.5-2.4-.5-3 3 2 5 5 5 8.2a7.5 7.5 0 0 1-15 0C16.5 21 21 18 24 12z', c)}
  </>),

  billInternet: (c) => (<>
    {ring(24, 24, 16, c)}
    {s('M15 22a13 13 0 0 1 18 0', c)}
    {s('M19 26.5a7.5 7.5 0 0 1 10 0', c)}
    {dot(24, 31, 1.8, c)}
  </>),

  billTv: (c) => (<>
    {ring(24, 24, 16, c)}
    {box(14, 17, 20, 14, c, 2.5, 2.2)}
    {s('M20 35h8', c, 2.2)}
  </>),

  billMobile: (c) => (<>
    {ring(24, 24, 16, c)}
    {box(18, 13, 12, 22, c, 3, 2.2)}
    {dot(24, 31, 1.5, c)}
  </>),

  billUtilities: (c) => (<>
    {ring(24, 24, 16, c)}
    {box(16, 16, 6.5, 6.5, c, 1.5, 2.2)}
    {box(25.5, 16, 6.5, 6.5, c, 1.5, 2.2)}
    {box(16, 25.5, 6.5, 6.5, c, 1.5, 2.2)}
    {box(25.5, 25.5, 6.5, 6.5, c, 1.5, 2.2)}
  </>),
};

// One drawing can stand for several keys. Anything not listed falls through
// to its own name.
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
  staffReports: 'reports',
  staffLedger: 'reports',
  ledger: 'reports',
  staffInquiries: 'inquiries',
  operations: 'adminFeatures',
  system: 'adminFeatures',
  apiProviderManagement: 'apiManagement',
  home: 'adminHome',
};

export function hasServiceArt(key) {
  const k = ALIASES[key] || key;
  return !!ART[k];
}

/** A drawn icon for a service key, or null when there is no drawing yet. */
export default function ServiceArt({ name, size = 30, color }) {
  const key = ALIASES[name] || name;
  const draw = ART[key];
  if (!draw) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G>{draw(color || DEFAULT_COLOR)}</G>
    </Svg>
  );
}
