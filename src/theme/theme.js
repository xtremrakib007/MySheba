// Central design tokens for the entire MySheba UI.
// Global contract: light = white surfaces/black foreground; dark = deep charcoal surfaces/white foreground.
// Contrast is intentionally strong so text, cards, controls and grid boundaries remain visible on small screens.
export const lightColors = {
  primary: '#0B8A94', primaryDark: '#0A5C78', secondary: '#1481B5',
  navy: '#0A5C78', scrim: '#000000', success: '#14895A', warning: '#8A5700', error: '#C62828',
  bg: '#F2FAF7', card: '#FCFFFE', surface: '#EAF7F2', surfaceElevated: '#FFFFFF',
  text: '#0F2E33', textSecondary: '#476A6B', onPrimary: '#FFFFFF',
  border: '#BFE6DA', divider: '#D5EFE7', placeholder: '#5A7A7A',
  inputBg: '#F5FCFA', disabledBg: '#EAF7F2', disabledText: '#5A7A7A',
  tileBg: '#F8FDFB', tileBorder: '#8ADBC3', canvasBg: '#E3F4EE',
};

export const darkColors = {
  primary: '#26C6C0', primaryDark: '#12909A', secondary: '#4DB3E6',
  navy: '#E4FBF3', scrim: '#000000', success: '#5FD08F', warning: '#FFD166', error: '#FF6B6B',
  bg: '#061719', card: '#0B2226', surface: '#0E2A2E', surfaceElevated: '#123338',
  text: '#E8FBF5', textSecondary: '#B8D6D0', onPrimary: '#04211C',
  border: '#245A58', divider: '#1B4644', placeholder: '#8DB0AA',
  inputBg: '#0E2A2E', disabledBg: '#123338', disabledText: '#8DB0AA',
  tileBg: '#123338', tileBorder: '#2E7F72', canvasBg: '#0A1F22',
};

export const colors = lightColors;

// Theme swatches stay vivid, while the light-mode primary values are chosen
// to remain readable when used directly as text, labels or icons on white.
// The palette is chosen by the signed-in role, not by the person. The
// mockup colours the whole surface per role - green for Customer, blue for
// Admin, purple for Superadmin - so role is what getPalette keys on, and
// the Theme Color picker that used to set this is gone.
//
// The mockup only draws three roles. Dealer and Reseller get their own
// colours in the same construction so staff can still tell at a glance
// which account they are in; those two are our choice, not the mockup's.
//
// Every value is contrast-checked, not eyeballed: primary reaches 4.5:1
// against the card it is drawn on (it is used as text and icon colour),
// secondary reaches 3:1, and white header text clears 4.5:1 on every stop
// of that role's gradient. customer.secondary and dealer.secondary are
// darker than their mockup swatch for that last reason - the lighter
// greens left white header text at 3.4:1.
export const roleThemes = {
  // Teal, taken from the logo rather than picked by eye: the icon's dominant
  // colour is #0DB4B2, hue 179.3. Each swatch keeps the saturation and
  // lightness it had as green and moves to that hue, so the palette's internal
  // relationships are unchanged and only the colour differs.
  //
  // light.secondary is the one exception, darkened from #0F8685 to #0F8483.
  // Teal reads slightly lighter than green at identical lightness, and the
  // straight hue shift left white header text at 4.40:1 on that gradient stop
  // - under the 4.5 this file holds itself to, and the same trap the note
  // above describes for the original greens.
  // The gradient now travels the way the logo does. The mark is not one teal:
  // it sweeps from a green-teal (hue 168) to a blue-teal (hue 189), and a
  // header built from three stops of a single hue read as a different colour
  // beside it however close that hue was.
  //
  // The logo's own swatches are 2.0-3.3:1 against white text, so they cannot
  // be used as a header directly - that is the trap the note above describes.
  // The SWEEP is what is taken, at the lightness each stop needs to clear the
  // 4.5:1 this file holds itself to. Dark keeps each swatch's own lightness and
  // saturation and moves only its hue, which is the same move again.
  customer: { label: 'Customer',
    light: { primary: '#087F7F', primaryDark: '#065462', secondary: '#08846B', gold: '#2DBEBC' },
    dark:  { primary: '#3FD9CF', primaryDark: '#1E879A', secondary: '#57E0C5', gold: '#7CEFEE' } },
  admin: { label: 'Admin',
    light: { primary: '#1257B0', primaryDark: '#0C3F84', secondary: '#1A73E8', gold: '#4A9DFF' },
    dark:  { primary: '#6BB0FF', primaryDark: '#2F7FD6', secondary: '#8CC4FF', gold: '#B6DCFF' } },
  superadmin: { label: 'Superadmin',
    light: { primary: '#6A2BBF', primaryDark: '#4E1E92', secondary: '#7C3AED', gold: '#A56BF5' },
    dark:  { primary: '#B98CFF', primaryDark: '#8B5CF6', secondary: '#C9A8FF', gold: '#DCC6FF' } },
  dealer: { label: 'Dealer',
    light: { primary: '#0A6E78', primaryDark: '#08525A', secondary: '#0E828E', gold: '#22B3B0' },
    dark:  { primary: '#3FCBD4', primaryDark: '#1C949E', secondary: '#62DCE2', gold: '#9BEFF2' } },
  reseller: { label: 'Reseller',
    light: { primary: '#8A4B00', primaryDark: '#6B3A00', secondary: '#A85D00', gold: '#D08A22' },
    dark:  { primary: '#FFB86B', primaryDark: '#E0913F', secondary: '#FFCB94', gold: '#FFE0BC' } },
};

export const roleList = Object.keys(roleThemes);
export const DEFAULT_ROLE = 'customer';

// Ten user-selectable visual styles. All styles share the same content/action
// layer; only presentation changes. Rendering components enforce contrast,
// wrapping and minimum touch targets in both light and dark mode.
export const gridStyles = {
  bordered: { label: 'Bordered Cards', description: 'Crisp professional cards' },
  classic: { label: 'Classic', description: 'Familiar business tile layout' },
  soft: { label: 'Soft', description: 'Rounded and comfortable' },
  minimal: { label: 'Minimal', description: 'Clean, distraction-free' },
  glass: { label: 'Premium Glass', description: 'Layered translucent premium look' },
  threeD: { label: 'Modern 3D', description: 'Depth with restrained elevation' },
  gradient: { label: 'Dynamic Gradient', description: 'Bold commercial gradients' },
  neon: { label: 'Neon Dark', description: 'Premium dark glow accents' },
  bento: { label: 'Bento Grid', description: 'Mixed-size visual hierarchy' },
  adaptive: { label: 'Adaptive Dynamic', description: 'Highlights important services' },
};
export const gridStyleList = Object.keys(gridStyles);
export const DEFAULT_GRID_STYLE = 'bordered';
export const gradients = { purple: ['#667eea', '#764ba2'], pink: ['#f093fb', '#f5576c'], blue: ['#4facfe', '#00f2fe'], orange: ['#fa8231', '#f7b731'], green: ['#20bf6b', '#0fb9b1'] };
// Three deep stops. It must end on primaryDark rather than a light tint,
// because white header text sits on the whole sweep - on a light end stop
// that measured 2.4:1.
export const brandGradientFor = (palette) => [palette.secondary, palette.primary, palette.primaryDark];
export const brandGradient = brandGradientFor(lightColors);
export function getPalette(mode, role) {
  const base = mode === 'dark' ? darkColors : lightColors;
  const theme = roleThemes[role] || roleThemes[DEFAULT_ROLE];
  return { ...base, ...(mode === 'dark' ? theme.dark : theme.light) };
}
export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, tile: 18, card: 22, sheet: 24, pill: 999 };

/**
 * How big a tile's icon is drawn, everywhere a tile is drawn.
 *
 * One number rather than one per grid. It was 32 in the service grid and 28 in
 * the feature grid, which is the shape of thing that drifts: the same tile was
 * a different size depending on which screen you reached it from, and nothing
 * said so.
 *
 * Sized against the tile rather than picked - the cards are a little over 110dp
 * wide, and the artwork is meant to be the tile rather than a stamp in the
 * corner of it. The wrap is a few points taller so a drawing and a picture sit
 * on the same baseline whatever their own proportions are.
 *
 * Came down from 52, then 44, then 38, each time after seeing it on a phone:
 * a grid of nine is mostly artwork long before the icon looks big on its own.
 * 34 is the floor the tile-size test holds - below it the picture stops
 * reading as the tile's subject and starts reading as a stamp on a label.
 */
export const tileIcon = { size: 34, wrap: 38, emoji: 30 };

/**
 * One shape for every tile, on every grid, for every role.
 *
 * The service grid laid out three across and the feature grid four, and
 * neither was square - so the same feature was a different size and a
 * different shape depending on which screen you reached it from, and an admin
 * grid of 75dp tiles could not carry a two-line label at all.
 *
 * Square because the artwork is square: a picture in a short wide box either
 * leaves air down both sides or gets cropped, and a grid of them reads as
 * uneven even when every box is identical.
 *
 * The tile gets smaller by widening the gap, not by adding a column: three
 * across is what carries a two-line label on a 320dp phone, and a fourth
 * column cannot. So the row keeps three and each one takes less of it.
 *
 * The width has to leave room for the two gaps in real pixels, not just in
 * percent: on the narrowest phone the service grid lays out in 288dp, where
 * 3 * 29.5% is 255dp and the two 12dp gaps are 24 - 279 of 288. The slack is
 * deliberate. Fill the row exactly and any inset nobody counted (a border, a
 * scrollbar, a parent's padding) wraps the third tile onto its own line and
 * leaves a hole, which is how four across failed before.
 */
export const tileGrid = { columns: 3, gap: 12, width: '29.5%' };

// Soft, colour-tinted elevation rather than a neutral black shadow, which
// on the tinted surfaces here reads as grime. Used by the cards the home
// surfaces are built from.
export const shadows = {
  card: { shadowColor: '#0A5C33', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  raised: { shadowColor: '#0A5C33', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
};