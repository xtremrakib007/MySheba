import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { getPalette, accentThemes, accentList, DEFAULT_ACCENT, gridStyles, gridStyleList, DEFAULT_GRID_STYLE } from './theme';

// User display customization is intentionally fixed by the app.
// Light/dark follows the device automatically; accent, grid and icon styles
// remain the product defaults. The old AsyncStorage customization keys are
// deliberately ignored so existing users cannot retain personal overrides.
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

function currentSystemScheme() {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}
const initialSystemScheme = currentSystemScheme();

const ThemeContext = createContext({
  mode: 'system',
  resolvedMode: initialSystemScheme,
  accent: DEFAULT_ACCENT,
  colors: getPalette(initialSystemScheme, DEFAULT_ACCENT),
  brandGradient: [getPalette(initialSystemScheme, DEFAULT_ACCENT).primary, getPalette(initialSystemScheme, DEFAULT_ACCENT).secondary],
  isDark: initialSystemScheme === 'dark',
  isSystemMode: true,
  setMode: () => {},
  toggleMode: () => {},
  setAccent: () => {},
  accentThemes,
  accentList,
  gridStyle: DEFAULT_GRID_STYLE,
  setGridStyle: () => {},
  gridStyles,
  gridStyleList,
  iconStyle: DEFAULT_ICON_STYLE,
  setIconStyle: () => {},
  iconStyles,
  iconStyleList,
  loaded: true,
});

export function ThemeProvider({ children }) {
  const [systemScheme, setSystemScheme] = useState(initialSystemScheme);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo(() => {
    const resolvedMode = systemScheme;
    const palette = getPalette(resolvedMode, DEFAULT_ACCENT);
    return {
      mode: 'system',
      resolvedMode,
      accent: DEFAULT_ACCENT,
      colors: palette,
      brandGradient: [palette.primary, palette.secondary],
      isDark: resolvedMode === 'dark',
      isSystemMode: true,

      // Kept as inert compatibility methods so stale callers cannot mutate
      // the fixed product presentation.
      setMode: () => {},
      toggleMode: () => {},
      setAccent: () => {},
      accentThemes,
      accentList,

      gridStyle: DEFAULT_GRID_STYLE,
      setGridStyle: () => {},
      gridStyles,
      gridStyleList,

      iconStyle: DEFAULT_ICON_STYLE,
      setIconStyle: () => {},
      iconStyles,
      iconStyleList,
      loaded: true,
    };
  }, [systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
export function useThemeColors() { return useContext(ThemeContext).colors; }
export default ThemeContext;
