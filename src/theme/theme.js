// Central design tokens for the entire MySheba UI.
// Global contract: light = white surfaces/black foreground; dark = black surfaces/white foreground.
export const lightColors = {
  primary: '#00A99D', primaryDark: '#00897B', secondary: '#1A73E8',
  navy: '#000000', scrim: '#000000', success: '#4CAF50', warning: '#FBBC04', error: '#EA4335',
  bg: '#FFFFFF', card: '#FFFFFF', surface: '#FFFFFF', surfaceElevated: '#FFFFFF',
  text: '#000000', textSecondary: '#000000', onPrimary: '#FFFFFF',
  border: '#000000', divider: '#000000', placeholder: '#000000',
  inputBg: '#FFFFFF', disabledBg: '#FFFFFF', disabledText: '#000000',
};

export const darkColors = {
  primary: '#26D0C4', primaryDark: '#00A99D', secondary: '#5B9DF9',
  navy: '#FFFFFF', scrim: '#000000', success: '#66D07A', warning: '#FBBC04', error: '#F2665E',
  bg: '#000000', card: '#000000', surface: '#000000', surfaceElevated: '#000000',
  text: '#FFFFFF', textSecondary: '#FFFFFF', onPrimary: '#000000',
  border: '#FFFFFF', divider: '#FFFFFF', placeholder: '#FFFFFF',
  inputBg: '#000000', disabledBg: '#000000', disabledText: '#FFFFFF',
};

export const colors = lightColors;

export const accentThemes = {
  teal: { label: 'Teal', swatch: '#00A99D', light: { primary: '#00A99D', primaryDark: '#00897B', secondary: '#1A73E8' }, dark: { primary: '#26D0C4', primaryDark: '#00A99D', secondary: '#5B9DF9' } },
  blue: { label: 'Ocean Blue', swatch: '#1A73E8', light: { primary: '#1A73E8', primaryDark: '#0F56B3', secondary: '#00A99D' }, dark: { primary: '#5B9DF9', primaryDark: '#1A73E8', secondary: '#26D0C4' } },
  purple: { label: 'Royal Purple', swatch: '#7C4DFF', light: { primary: '#7C4DFF', primaryDark: '#5E35B1', secondary: '#4facfe' }, dark: { primary: '#B39DFF', primaryDark: '#8E6CFF', secondary: '#5B9DF9' } },
  rose: { label: 'Rose', swatch: '#F5576C', light: { primary: '#F5576C', primaryDark: '#C62839', secondary: '#f093fb' }, dark: { primary: '#FF8A9B', primaryDark: '#F5576C', secondary: '#F0A9FF' } },
  amber: { label: 'Amber', swatch: '#FF9F43', light: { primary: '#FF9F43', primaryDark: '#E07C1E', secondary: '#FBBC04' }, dark: { primary: '#FFB86B', primaryDark: '#FF9F43', secondary: '#FBBC04' } },
  emerald: { label: 'Emerald', swatch: '#0FB981', light: { primary: '#0FB981', primaryDark: '#0A8F63', secondary: '#20bf6b' }, dark: { primary: '#3EDDA6', primaryDark: '#0FB981', secondary: '#5CE0A0' } },
  mix: { label: 'Vivid Mix', swatch: '#FF3EA5', gradientSwatch: ['#FF3EA5', '#7C4DFF', '#00C2FF'], light: { primary: '#FF3EA5', primaryDark: '#D6127D', secondary: '#00C2FF' }, dark: { primary: '#FF6FC4', primaryDark: '#FF3EA5', secondary: '#3DD9FF' } },
};

export const accentList = Object.keys(accentThemes);
export const DEFAULT_ACCENT = 'teal';

// Ten user-selectable visual styles. All styles share the same content/action
// layer; only presentation changes. The rendering components also enforce
// contrast, wrapping and minimum touch targets in both light and dark mode.
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
export const brandGradient = [lightColors.primary, lightColors.secondary];
export function getPalette(mode, accent) {
  const base = mode === 'dark' ? darkColors : lightColors;
  const theme = accentThemes[accent] || accentThemes[DEFAULT_ACCENT];
  const accentColors = mode === 'dark' ? theme.dark : theme.light;
  return { ...base, ...accentColors };
}
export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };
export const radius = { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 };
