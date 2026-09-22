import { Platform } from 'react-native';
// Central design tokens for the entire MySheba UI.
//
// Palette follows the MySheba royal mockup: a teal/emerald system with soft
// mint surfaces in light mode and deep teal-black in dark. Three values are
// deliberately a shade off the mockup because the mockup's own figures fail
// WCAG AA against the surfaces they sit on, and this file's long-standing
// contract is that text, controls and boundaries stay legible on small
// screens:
//
//   primary     #0B8A94 -> #0A838D   white-on-primary 4.14:1 -> 4.52:1
//   placeholder #5A7A7A -> #597979   on inputBg       4.49:1 -> 4.55:1
//   dark border #245A58 -> #2F7572   on dark card     2.11:1 -> 3.07:1
//
// The differences are imperceptible side by side. `border` keeps the
// mockup's soft mint for decorative rules; `tileBorder` is the stronger
// value to use wherever an edge actually carries meaning, which is how the
// mockup itself splits them.
export const lightColors = {
  primary: '#0A838D', primaryDark: '#0A5C78', secondary: '#1481B5',
  navy: '#0A5C78', scrim: '#000000', success: '#14895A', warning: '#8A5700', error: '#C62828',
  bg: '#F2FAF7', card: '#FCFFFE', surface: '#EAF7F2', surfaceElevated: '#FFFFFF',
  text: '#0F2E33', textSecondary: '#476A6B', onPrimary: '#FFFFFF',
  border: '#BFE6DA', divider: '#D5EFE7', placeholder: '#597979',
  inputBg: '#F5FCFA', disabledBg: '#E3F4EE', disabledText: '#5A7A7A',
  // Accent layer from the mockup - highlights, tile edges and hero canvas.
  gold: '#19C39B', goldLight: '#A6F5D2', goldDeep: '#0E9E8C',
  tileBg: '#F8FDFB', tileBorder: '#8ADBC3', canvasBg: '#E3F4EE',
  accentLine: '#D9FFF0', heroText: '#F2FFFA',
  headerGradient: ['#1481B5', '#12A9A6', '#25D48F'],
  heroGradient: ['#0F6FA8', '#0FA0A0', '#1FC98A'],
  // Aliases for names components already reference. Without these,
  // colors.background resolved to undefined in RemittanceReceipt (an
  // unguarded backgroundColor, so the view rendered transparent); the other
  // three were guarded with `||` fallbacks that bypassed the theme entirely.
  background: '#F2FAF7', danger: '#C62828', muted: '#476A6B', surfaceVariant: '#EAF7F2',
};

export const darkColors = {
  primary: '#26C6C0', primaryDark: '#12909A', secondary: '#4DB3E6',
  navy: '#E4FBF3', scrim: '#000000', success: '#5FD08F', warning: '#FFD166', error: '#FF6B6B',
  // Distinct dark surfaces rather than pure black, so elevation, borders and
  // cards keep communicating hierarchy.
  bg: '#061719', card: '#0B2226', surface: '#0E2A2E', surfaceElevated: '#123338',
  text: '#E8FBF5', textSecondary: '#B8D6D0', onPrimary: '#04211C',
  border: '#2F7572', divider: '#1B4644', placeholder: '#8DB0AA',
  inputBg: '#0E2A2E', disabledBg: '#0A1F22', disabledText: '#8DB0AA',
  gold: '#19C39B', goldLight: '#A6F5D2', goldDeep: '#3FD9A4',
  tileBg: '#123338', tileBorder: '#2E7F72', canvasBg: '#0A1F22',
  accentLine: '#A6F5D2', heroText: '#F2FFFA',
  headerGradient: ['#0A5C86', '#0A7F80', '#12946A'],
  heroGradient: ['#0B4F76', '#0A6F72', '#0D7F5E'],
  background: '#061719', danger: '#FF6B6B', muted: '#B8D6D0', surfaceVariant: '#0E2A2E',
};

export const colors = lightColors;

// Theme swatches stay vivid, while the light-mode primary values are chosen
// to remain readable when used directly as text, labels or icons on white.
export const accentThemes = {
  royal: { label: 'Royal Teal', swatch: '#0A838D', light: { primary: '#0A838D', primaryDark: '#0A5C78', secondary: '#1481B5' }, dark: { primary: '#26C6C0', primaryDark: '#12909A', secondary: '#4DB3E6' } },
  teal: { label: 'Teal', swatch: '#00A99D', light: { primary: '#00A99D', primaryDark: '#00897B', secondary: '#1A73E8' }, dark: { primary: '#26D0C4', primaryDark: '#00A99D', secondary: '#5B9DF9' } },
  blue: { label: 'Ocean Blue', swatch: '#1A73E8', light: { primary: '#1A73E8', primaryDark: '#0F56B3', secondary: '#00A99D' }, dark: { primary: '#5B9DF9', primaryDark: '#1A73E8', secondary: '#26D0C4' } },
  purple: { label: 'Royal Purple', swatch: '#7C4DFF', light: { primary: '#5E35B1', primaryDark: '#4527A0', secondary: '#1976D2' }, dark: { primary: '#B39DFF', primaryDark: '#8E6CFF', secondary: '#5B9DF9' } },
  rose: { label: 'Rose', swatch: '#F5576C', light: { primary: '#C62839', primaryDark: '#9E1B2B', secondary: '#AD1457' }, dark: { primary: '#FF8A9B', primaryDark: '#F5576C', secondary: '#F0A9FF' } },
  amber: { label: 'Amber', swatch: '#FF9F43', light: { primary: '#8A5700', primaryDark: '#6B4300', secondary: '#8A5700' }, dark: { primary: '#FFB86B', primaryDark: '#FF9F43', secondary: '#FBBC04' } },
  emerald: { label: 'Emerald', swatch: '#0FB981', light: { primary: '#0A8F63', primaryDark: '#06734F', secondary: '#087F5B' }, dark: { primary: '#3EDDA6', primaryDark: '#0FB981', secondary: '#5CE0A0' } },
  mix: { label: 'Vivid Mix', swatch: '#FF3EA5', gradientSwatch: ['#FF3EA5', '#7C4DFF', '#00C2FF'], light: { primary: '#C21870', primaryDark: '#9C155B', secondary: '#0077B6' }, dark: { primary: '#FF6FC4', primaryDark: '#FF3EA5', secondary: '#3DD9FF' } },
};

export const accentList = Object.keys(accentThemes);
// Royal is the palette the rest of this file is built around; the older
// accents stay available for anyone who picked one, since the choice is
// persisted per user.
export const DEFAULT_ACCENT = 'royal';

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
// Three stops rather than two, matching the mockup's header gradient.
// Built from palette tokens instead of hardcoded hexes so switching accent
// still moves the gradient - with the royal accent this resolves to
// #1481B5 -> #0A838D -> #19C39B, near-identical to the mockup's own
// #1481B5 -> #12A9A6 -> #25D48F but a shade deeper, which keeps white
// header text legible across the whole sweep.
export const brandGradientFor = (palette) => [palette.secondary, palette.primary, palette.gold];
export const brandGradient = brandGradientFor(lightColors);
export function getPalette(mode, accent) {
  const base = mode === 'dark' ? darkColors : lightColors;
  const theme = accentThemes[accent] || accentThemes[DEFAULT_ACCENT];
  const accentColors = mode === 'dark' ? theme.dark : theme.light;
  return { ...base, ...accentColors };
}
export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };
// sm..xl and pill keep their existing values so nothing shifts until a
// component opts in. tile/card/sheet are the mockup's own radii (18/22/24),
// added for the component work rather than applied here.
export const radius = { sm: 8, md: 12, lg: 14, xl: 20, tile: 18, card: 22, sheet: 24, pill: 999 };

// Soft, colour-tinted elevation from the mockup - a neutral black shadow
// reads grey against the mint surfaces, so these tint toward the brand navy.
// Spread as a style object: <View style={[styles.card, shadows.card]} />.
export const shadows = {
  card: { shadowColor: '#0A5C78', shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  raised: { shadowColor: '#0A5C78', shadowOpacity: 0.30, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  hero: { shadowColor: '#0B8A94', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
};

// The mockup sets its display type (brand, balance, section titles) in a
// serif. Georgia ships on iOS; Android has no Georgia, and its generic
// 'serif' family maps to Noto Serif, which is the closest match available
// without bundling a font file.
export const fonts = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
};