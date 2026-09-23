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
export const accentThemes = {
  teal: { label: 'Teal', swatch: '#0B8A94', light: { primary: '#0B8A94', primaryDark: '#0A5C78', secondary: '#1481B5' }, dark: { primary: '#26C6C0', primaryDark: '#12909A', secondary: '#4DB3E6' } },
  blue: { label: 'Ocean Blue', swatch: '#1A73E8', light: { primary: '#1A73E8', primaryDark: '#0F56B3', secondary: '#00A99D' }, dark: { primary: '#5B9DF9', primaryDark: '#1A73E8', secondary: '#26D0C4' } },
  purple: { label: 'Royal Purple', swatch: '#7C4DFF', light: { primary: '#5E35B1', primaryDark: '#4527A0', secondary: '#1976D2' }, dark: { primary: '#B39DFF', primaryDark: '#8E6CFF', secondary: '#5B9DF9' } },
  rose: { label: 'Rose', swatch: '#F5576C', light: { primary: '#C62839', primaryDark: '#9E1B2B', secondary: '#AD1457' }, dark: { primary: '#FF8A9B', primaryDark: '#F5576C', secondary: '#F0A9FF' } },
  amber: { label: 'Amber', swatch: '#FF9F43', light: { primary: '#8A5700', primaryDark: '#6B4300', secondary: '#8A5700' }, dark: { primary: '#FFB86B', primaryDark: '#FF9F43', secondary: '#FBBC04' } },
  emerald: { label: 'Emerald', swatch: '#0FB981', light: { primary: '#0A8F63', primaryDark: '#06734F', secondary: '#087F5B' }, dark: { primary: '#3EDDA6', primaryDark: '#0FB981', secondary: '#5CE0A0' } },
  mix: { label: 'Vivid Mix', swatch: '#FF3EA5', gradientSwatch: ['#FF3EA5', '#7C4DFF', '#00C2FF'], light: { primary: '#C21870', primaryDark: '#9C155B', secondary: '#0077B6' }, dark: { primary: '#FF6FC4', primaryDark: '#FF3EA5', secondary: '#3DD9FF' } },
};

export const accentList = Object.keys(accentThemes);
export const DEFAULT_ACCENT = 'teal';

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
export const brandGradient = ['#1481B5', '#12A9A6', '#25D48F'];
export function getPalette(mode, accent) {
  const base = mode === 'dark' ? darkColors : lightColors;
  const theme = accentThemes[accent] || accentThemes[DEFAULT_ACCENT];
  const accentColors = mode === 'dark' ? theme.dark : theme.light;
  return { ...base, ...accentColors };
}
export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };