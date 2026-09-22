// Icon sets behind Settings > Appearance > Icon Style.
//
// The ten styles in ThemeContext's `iconStyles` had labels, descriptions and
// a persisted preference, but nothing ever read the preference - every grid
// rendered the emoji hardcoded on the item. These maps are what makes the
// choice mean something.
//
// Two shapes of style:
//
//   - Emoji families (classic, business, playful, colorful) swap the glyph
//     for a different emoji with the same meaning. `classic` has no map: it
//     falls through to the icon defined on the item itself, so the default
//     look is exactly what shipped before.
//
//   - Symbol families (modern, outline, thin, filled, bold, compact) use the
//     brand-neutral geometric glyphs below, which come in a filled and a
//     hollow variant. They are drawn from the Geometric Shapes block plus a
//     few long-standing dingbats, all of which have been in Android's font
//     since well before the versions this app supports - unlike the newer
//     Miscellaneous Symbols and Arrows block, which renders as tofu on older
//     devices.
//
// A key missing from a map falls back to the item's own icon, so adding a
// service without touching this file degrades to the classic emoji rather
// than to a blank tile.

const SYMBOLS_FILLED = {
  recharge: '↻', mobilebanking: '▣', internet: '◉', remittance: '⇄',
  bus: '▬', train: '▦', flight: '✈', fomema: '✚', visa: '◩',
  mydigital: '◤', passport: '▮', moreFeaturesTile: '✦',
  myAccount: '●', profile: '◆', support: '☏', history: '◕',
  topup: '▲', topups: '▴', all: '☰', pending: '◐', processing: '◒',
  completed: '☑', finance: '★', payments: '▤', pricing: '▪',
  rates: '⇅', announcements: '▶', banners: '▰', inquiries: '✎',
  operations: '◈', system: '▩', users: '◙', userManagement: '◧',
  transferPoints: '↔', verificationManagement: '✔', featureAccess: '◫',
  adminAnalytics: '◢', adminBusinessManagement: '■', adminFeatures: '◍',
  dealerFeatures: '◖', resellerFeatures: '◀',
};

const SYMBOLS_OUTLINE = {
  recharge: '↺', mobilebanking: '▢', internet: '◎', remittance: '⇆',
  bus: '▭', train: '▧', flight: '✈', fomema: '✛', visa: '◪',
  mydigital: '◥', passport: '▯', moreFeaturesTile: '✧',
  myAccount: '○', profile: '◇', support: '☎', history: '◔',
  topup: '△', topups: '▵', all: '≡', pending: '◑', processing: '◓',
  completed: '☐', finance: '☆', payments: '▥', pricing: '▫',
  rates: '↕', announcements: '▷', banners: '▱', inquiries: '✐',
  operations: '◊', system: '▨', users: '◘', userManagement: '◨',
  transferPoints: '⇔', verificationManagement: '✓', featureAccess: '◬',
  adminAnalytics: '◣', adminBusinessManagement: '□', adminFeatures: '◌',
  dealerFeatures: '◗', resellerFeatures: '◁',
};

const BUSINESS = {
  recharge: '📶', mobilebanking: '🏛️', internet: '🌐', remittance: '🏦',
  bus: '🚍', train: '🚄', flight: '🛫', fomema: '⚕️', visa: '📑',
  mydigital: '🛃', passport: '📘', moreFeaturesTile: '➕',
  myAccount: '💼', profile: '🪪', support: '📞', history: '🗂️',
  topup: '💵', topups: '🧾', all: '📁', pending: '🕐', processing: '⚙️',
  completed: '✅', finance: '💹', payments: '💳', pricing: '🏷️',
  rates: '📉', announcements: '📢', banners: '📰', inquiries: '📄',
  operations: '🏭', system: '🖥️', users: '👔', userManagement: '🗄️',
  transferPoints: '🔁', verificationManagement: '📋', featureAccess: '🔑',
  adminAnalytics: '📈', adminBusinessManagement: '🏢', adminFeatures: '🗃️',
  dealerFeatures: '🧰', resellerFeatures: '📦',
};

const PLAYFUL = {
  recharge: '⚡', mobilebanking: '🐷', internet: '🛰️', remittance: '🎁',
  bus: '🚐', train: '🚂', flight: '🛩️', fomema: '🩺', visa: '🗺️',
  mydigital: '🛬', passport: '🧳', moreFeaturesTile: '🎉',
  myAccount: '🙂', profile: '🧑', support: '🤝', history: '📜',
  topup: '🪙', topups: '🎟️', all: '🗂️', pending: '⏰', processing: '🔄',
  completed: '🎊', finance: '💎', payments: '🛍️', pricing: '🎯',
  rates: '📶', announcements: '📣', banners: '🎪', inquiries: '💬',
  operations: '🧩', system: '🛡️', users: '👪', userManagement: '🧑‍🤝‍🧑',
  transferPoints: '🔀', verificationManagement: '🔎', featureAccess: '🗝️',
  adminAnalytics: '📈', adminBusinessManagement: '🏬', adminFeatures: '🧰',
  dealerFeatures: '🛒', resellerFeatures: '🎒',
};

const COLORFUL = {
  recharge: '🔋', mobilebanking: '💳', internet: '📶', remittance: '💵',
  bus: '🚌', train: '🚅', flight: '✈️', fomema: '🧬', visa: '🛂',
  mydigital: '🎫', passport: '📕', moreFeaturesTile: '🌈',
  myAccount: '🧑‍💻', profile: '🎭', support: '🎧', history: '📚',
  topup: '💰', topups: '🧧', all: '🗃️', pending: '🟡', processing: '🔵',
  completed: '🟢', finance: '🤑', payments: '🧾', pricing: '🔖',
  rates: '📊', announcements: '🔔', banners: '🖼️', inquiries: '📝',
  operations: '🚀', system: '🧿', users: '👥', userManagement: '🧑‍🏫',
  transferPoints: '♻️', verificationManagement: '🛡️', featureAccess: '🔐',
  adminAnalytics: '📉', adminBusinessManagement: '🌆', adminFeatures: '🧪',
  dealerFeatures: '🎨', resellerFeatures: '📦',
};

// set: null means "use the icon the item already carries".
//
// scale multiplies the grid's own icon font size and is what actually
// separates the six symbol styles. weight is set too, but do not count on
// it: the geometric glyphs above are usually served by a fallback font
// (Noto Sans Symbols on most Android builds) that ships a single weight, so
// fontWeight is frequently a no-op on exactly the styles that would want it.
// Size is the lever that always works, so the spread here is wide enough to
// read at a glance - thin to modern is a 30% step, compact to bold is 50%.
//
// So the ten styles are four emoji families plus two glyph families each
// drawn at three sizes. modern/outline/thin share the hollow glyphs and
// filled/bold/compact share the solid ones; within a family it is the size
// that differs, which is what their labels describe anyway.
export const ICON_STYLE_RENDER = {
  classic: { set: null, scale: 1, weight: '400' },
  business: { set: BUSINESS, scale: 1, weight: '400' },
  playful: { set: PLAYFUL, scale: 1.06, weight: '400' },
  colorful: { set: COLORFUL, scale: 1.06, weight: '400' },
  thin: { set: SYMBOLS_OUTLINE, scale: 0.76, weight: '300' },
  outline: { set: SYMBOLS_OUTLINE, scale: 1.0, weight: '400' },
  modern: { set: SYMBOLS_OUTLINE, scale: 1.26, weight: '500' },
  compact: { set: SYMBOLS_FILLED, scale: 0.72, weight: '600' },
  filled: { set: SYMBOLS_FILLED, scale: 1.0, weight: '600' },
  bold: { set: SYMBOLS_FILLED, scale: 1.38, weight: '900' },
};

const FALLBACK = ICON_STYLE_RENDER.classic;

export function iconRenderFor(style) {
  return ICON_STYLE_RENDER[style] || FALLBACK;
}

// The glyph to draw for `key` under `style`, falling back to the icon the
// item defines when the style has no entry for it.
export function iconFor(key, style, ownIcon) {
  const { set } = iconRenderFor(style);
  if (set && key && set[key]) return set[key];
  return ownIcon;
}
