// Central design tokens for the entire MySheba UI.
// Light mode: white surfaces with black foreground.
// Dark mode: black surfaces with white foreground.
// Accent colors remain available for branded controls, icons and status states.
export const lightColors = {
  primary: '#00A99D',
  primaryDark: '#00897B',
  secondary: '#1A73E8',
  navy: '#000000',
  scrim: '#000000',
  success: '#4CAF50',
  warning: '#FBBC04',
  error: '#EA4335',
  bg: '#FFFFFF',
  card: '#FFFFFF',
  text: '#000000',
  textSecondary: '#000000',
  border: '#000000',
};

export const darkColors = {
  primary: '#26D0C4',
  primaryDark: '#00A99D',
  secondary: '#5B9DF9',
  navy: '#FFFFFF',
  scrim: '#000000',
  success: '#66D07A',
  warning: '#FBBC04',
  error: '#F2665E',
  bg: '#000000',
  card: '#000000',
  text: '#FFFFFF',
  textSecondary: '#FFFFFF',
  border: '#FFFFFF',
};

// Back-compat static alias (light palette). Prefer useThemeColors() inside
// components so screens react to the light/dark setting.
export const colors = lightColors;

// Accent themes - these affect branded controls only. Surface and foreground
// colors always come from the active light/dark palette above.
export const accentThemes = {
  teal: {
    label: 'Teal',
    swatch: '#00A99D',
    light: { primary: '#00A99D', primaryDark: '#00897B', secondary: '#1A73E8' },
    dark: { primary: '#26D0C4', primaryDark: '#00A99D', secondary: '#5B9DF9' },
  },
  blue: {
    label: 'Ocean Blue',
    swatch: '#1A73E8',
    light: { primary: '#1A73E8', primaryDark: '#0F56B3', secondary: '#00A99D' },
    dark: { primary: '#5B9DF9', primaryDark: '#1A73E8', secondary: '#26D0C4' },
  },
  purple: {
    label: 'Royal Purple',
    swatch: '#7C4DFF',
    light: { primary: '#7C4DFF', primaryDark: '#5E35B1', secondary: '#4facfe' },
    dark: { primary: '#B39DFF', primaryDark: '#8E6CFF', secondary: '#5B9DF9' },
  },
  rose: {
    label: 'Rose',
    swatch: '#F5576C',
    light: { primary: '#F5576C', primaryDark: '#C62839', secondary: '#f093fb' },
    dark: { primary: '#FF8A9B', primaryDark: '#F5576C', secondary: '#F0A9FF' },
  },
  amber: {
    label: 'Amber',
    swatch: '#FF9F43',
    light: { primary: '#FF9F43', primaryDark: '#E07C1E', secondary: '#FBBC04' },
    dark: { primary: '#FFB86B', primaryDark: '#FF9F43', secondary: '#FBBC04' },
  },
  emerald: {
    label: 'Emerald',
    swatch: '#0FB981',
    light: { primary: '#0FB981', primaryDark: '#0A8F63', secondary: '#20bf6b' },
    dark: { primary: '#3EDDA6', primaryDark: '#0FB981', secondary: '#5CE0A0' },
  },
  mix: {
    label: 'Vivid Mix',
    swatch: '#FF3EA5',
    gradientSwatch: ['#FF3EA5', '#7C4DFF', '#00C2FF'],
    light: { primary: '#FF3EA5', primaryDark: '#D6127D', secondary: '#00C2FF' },
    dark: { primary: '#FF6FC4', primaryDark: '#FF3EA5', secondary: '#3DD9FF' },
  },
};

export const accentList = Object.keys(accentThemes);
export const DEFAULT_ACCENT = 'teal';

export const gridStyles = {
  bordered: { label: 'Bordered Cards' },
  classic: { label: 'Classic' },
  soft: { label: 'Soft' },
  minimal: { label: 'Minimal' },
};
export const gridStyleList = Object.keys(gridStyles);
export const DEFAULT_GRID_STYLE = 'bordered';

export const gradients = {
  purple: ['#667eea', '#764ba2'],
  pink: ['#f093fb', '#f5576c'],
  blue: ['#4facfe', '#00f2fe'],
  orange: ['#fa8231', '#f7b731'],
  green: ['#20bf6b', '#0fb9b1'],
};

export const brandGradient = [lightColors.primary, lightColors.secondary];

export function getPalette(mode, accent) {
  const base = mode === 'dark' ? darkColors : lightColors;
  const theme = accentThemes[accent] || accentThemes[DEFAULT_ACCENT];
  const accentColors = mode === 'dark' ? theme.dark : theme.light;
  return { ...base, ...accentColors };
}

export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };
export const radius = { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 };
