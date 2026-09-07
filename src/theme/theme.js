// Central design tokens - mirrors the original CSS :root variables 1:1
//
// Brand palette matches the Login screen redesign: teal -> blue gradient,
// navy headings, light blue-tinted page background. `primary` (teal) and
// `secondary` (blue) together form the brand gradient, used for header
// bars and primary CTA buttons across the app.
//
// Two palettes - lightColors (the original values, unchanged) and
// darkColors (same keys, dark-mode equivalents). Screens don't import
// `colors` directly anymore; they call useTheme()/useThemeColors() from
// ./ThemeContext, which picks one of these two based on the user's
// light/dark setting. `colors` is kept exported here too, as a static
// alias for lightColors, only for non-component modules (e.g. constants
// files) that can't call a hook.
export const lightColors = {
  primary: '#00A99D',
  primaryDark: '#00897B',
  secondary: '#1A73E8',
  navy: '#0B2447',
  scrim: '#0B2447',
  success: '#4CAF50',
  warning: '#FBBC04',
  error: '#EA4335',
  bg: '#F3F7FB',
  card: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  border: '#E0E0E0',
};

export const darkColors = {
  primary: '#26D0C4',
  primaryDark: '#00A99D',
  secondary: '#5B9DF9',
  navy: '#EAF1FB',
  scrim: '#0B2447',
  success: '#66D07A',
  warning: '#FBBC04',
  error: '#F2665E',
  bg: '#0E1420',
  card: '#171F2E',
  text: '#EAF1FB',
  textSecondary: '#9AA6BA',
  border: '#2A3548',
};

// Back-compat static alias (light palette). Prefer useThemeColors() inside
// components so screens react to the light/dark setting.
export const colors = lightColors;

// Accent themes - user-selectable replacements for primary/primaryDark/
// secondary only. Every other token (bg, card, text, border, success,
// warning, error, etc.) stays exactly as defined in lightColors/darkColors
// above, so switching accent never touches surface or status colors, just
// the brand hue used for headers, buttons, active nav labels, and links.
// Each accent has its own light and dark pair so contrast against bg/card
// holds up in both modes (dark variants generally lean a bit brighter/
// lighter than their light-mode counterpart, matching how the original
// teal primary went #00A99D -> #26D0C4 between lightColors/darkColors).
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
  // Brighter than the other six single-hue accents on purpose - pink into
  // violet into cyan, rendered as a gradient swatch (see gradientSwatch)
  // instead of a flat circle in ThemeColorModal so it reads as "mixed"
  // rather than just another solid color. `swatch` still gets a single
  // representative color for any spot that isn't gradient-aware.
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

// Grid tile styles - user-selectable, independent of accent/light-dark.
// 'bordered' is the newer bordered/gradient-card look; 'classic' is the
// original colored-icon-circle + accent-bar look; 'soft' is a flat colored
// icon badge on a plain shadowed card (no border, no accent bar); 'minimal'
// drops the card entirely - just a tinted icon badge and label floating on
// the screen background. All four are rendered by
// ServiceGrid/FeatureGrid/MoreFeaturesScreen/MarketplaceHubScreen based on
// ThemeContext's `gridStyle`.
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

// Brand gradient (teal -> blue) - same as the Login screen's hero swoosh,
// buttons, and logo colors. Use for header bars and primary CTAs.
// Static alias (light palette) - prefer useThemeColors().brandGradient
// inside components.
export const brandGradient = [lightColors.primary, lightColors.secondary];

// mode: 'light' | 'dark'. accent: one of accentList (defaults to teal, the
// original brand color) if omitted or unrecognized, so any existing caller
// that still calls getPalette(mode) with one argument keeps working exactly
// as before.
export function getPalette(mode, accent) {
  const base = mode === 'dark' ? darkColors : lightColors;
  const theme = accentThemes[accent] || accentThemes[DEFAULT_ACCENT];
  const accentColors = mode === 'dark' ? theme.dark : theme.light;
  return { ...base, ...accentColors };
}

export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };

export const radius = { sm: 8, md: 12, lg: 14, xl: 20, pill: 999 };
