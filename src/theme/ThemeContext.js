import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { getPalette, brandGradientFor, roleThemes, roleList, DEFAULT_ROLE, gridStyles, gridStyleList, DEFAULT_GRID_STYLE } from './theme';
import { useApp } from '../context/AppContext';

// Ten selectable icon presentations. They only change service iconography;
// country flags, operator logos and mobile-banking/provider branding are never replaced.
export const iconStyles = {
  classic: { label: 'Classic', description: 'Familiar service icons with a clean look.' },
  modern: { label: 'Modern', description: 'Simple contemporary icons matched to each service.' },
  filled: { label: 'Filled', description: 'Bold filled symbols for quick recognition.' },
  outline: { label: 'Outline', description: 'Lightweight outline-style service symbols.' },
  playful: { label: 'Playful', description: 'Friendly expressive icons, still matched to the service.' },
  compact: { label: 'Compact', description: 'Small, simple symbols for a tighter visual style.' },
  business: { label: 'Business', description: 'Professional service symbols for a corporate look.' },
  colorful: { label: 'Colorful', description: 'Vivid service symbols with stronger visual character.' },
  thin: { label: 'Thin Line', description: 'Light line-inspired symbols for a refined look.' },
  bold: { label: 'Bold', description: 'Large, high-impact symbols for fast scanning.' },
};
export const iconStyleList = Object.keys(iconStyles);
export const DEFAULT_ICON_STYLE = 'classic';

// Light only.
//
// The app ships one appearance. app.base.json already pins the native side to
// userInterfaceStyle "light", so the OS never hands us a dark surface; this is
// the JS half, which was still resolving dark from the system scheme or a
// stored preference and producing a half-dark app on a dark phone.
//
// It is enforced here rather than by deleting the dark palettes, because
// roleThemes.*.dark is what getPalette expects to exist and forty components
// read `isDark`. One resolved value keeps every one of those correct without
// touching them, and turning dark mode back on later is this constant.
//
// setMode and toggleMode stay as no-ops for the same reason setGridStyle and
// setIconStyle already are: the surface stays stable, the product decides.
const FORCED_MODE = 'light';

const ThemeContext = createContext({
  mode: FORCED_MODE, resolvedMode: FORCED_MODE,
  role: DEFAULT_ROLE,
  colors: getPalette(FORCED_MODE, DEFAULT_ROLE),
  brandGradient: brandGradientFor(getPalette(FORCED_MODE, DEFAULT_ROLE)),
  isDark: false, isSystemMode: false,
  setMode: () => {}, toggleMode: () => {}, roleThemes, roleList,
  gridStyle: DEFAULT_GRID_STYLE, setGridStyle: () => {}, gridStyles, gridStyleList,
  iconStyle: DEFAULT_ICON_STYLE, setIconStyle: () => {}, iconStyles, iconStyleList,
});

export function ThemeProvider({ children }) {
  // Role, not a stored preference: the palette follows the account that is
  // signed in. ThemeProvider therefore sits inside AppProvider (see App.js)
  // so it can read the profile directly - a copy kept in sync by hand would
  // just be a second source of truth to drift.
  const { profile } = useApp();
  const role = roleThemes[profile?.role] ? profile.role : DEFAULT_ROLE;
  const [gridStyle] = useState(DEFAULT_GRID_STYLE);
  const [iconStyle] = useState(DEFAULT_ICON_STYLE);
  const [loaded, setLoaded] = useState(false);

  // Nothing to load and nothing to listen to: no stored mode is read, and the
  // OS appearance is deliberately ignored.
  useEffect(() => { setLoaded(true); }, []);

  const setMode = useCallback(() => {}, []);
  const toggleMode = useCallback(() => {}, []);
  // Product-controlled visual identity: theme color, grid, and icon style are not user-configurable.
  const setGridStyle = useCallback(() => {}, []);
  const setIconStyle = useCallback(() => {}, []);

  const value = useMemo(() => {
    const resolvedMode = FORCED_MODE;
    const palette = getPalette(resolvedMode, role);
    return {
      mode: FORCED_MODE, resolvedMode, role, colors: palette,
      brandGradient: brandGradientFor(palette),
      isDark: false, isSystemMode: false,
      setMode, toggleMode, roleThemes, roleList,
      gridStyle, setGridStyle, gridStyles, gridStyleList,
      iconStyle, setIconStyle, iconStyles, iconStyleList,
      loaded,
    };
  }, [role, gridStyle, iconStyle, loaded, setMode, toggleMode, setGridStyle, setIconStyle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
export function useThemeColors() { return useContext(ThemeContext).colors; }
export default ThemeContext;
