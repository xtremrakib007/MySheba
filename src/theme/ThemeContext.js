import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPalette, brandGradientFor, roleThemes, roleList, DEFAULT_ROLE, gridStyles, gridStyleList, DEFAULT_GRID_STYLE } from './theme';
import { useApp } from '../context/AppContext';

const STORAGE_KEY = 'mysheba.themeMode';

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

function currentSystemScheme() { return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'; }
const initialSystemScheme = currentSystemScheme();

const ThemeContext = createContext({
  mode: 'system', resolvedMode: initialSystemScheme,
  role: DEFAULT_ROLE,
  colors: getPalette(initialSystemScheme, DEFAULT_ROLE),
  brandGradient: brandGradientFor(getPalette(initialSystemScheme, DEFAULT_ROLE)),
  isDark: initialSystemScheme === 'dark', isSystemMode: true,
  setMode: () => {}, toggleMode: () => {}, roleThemes, roleList,
  gridStyle: DEFAULT_GRID_STYLE, setGridStyle: () => {}, gridStyles, gridStyleList,
  iconStyle: DEFAULT_ICON_STYLE, setIconStyle: () => {}, iconStyles, iconStyleList,
});

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('system');
  const [systemScheme, setSystemScheme] = useState(initialSystemScheme);
  // Role, not a stored preference: the palette follows the account that is
  // signed in. ThemeProvider therefore sits inside AppProvider (see App.js)
  // so it can read the profile directly - a copy kept in sync by hand would
  // just be a second source of truth to drift.
  const { profile } = useApp();
  const role = roleThemes[profile?.role] ? profile.role : DEFAULT_ROLE;
  const [gridStyle] = useState(DEFAULT_GRID_STYLE);
  const [iconStyle] = useState(DEFAULT_ICON_STYLE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
    ]).then(([savedMode]) => {
      if (cancelled) return;
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') setModeState(savedMode);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light'));
    return () => subscription.remove();
  }, []);

  const setMode = useCallback((next) => { setModeState(next); AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {}); }, []);
  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const currentlyDark = prev === 'system' ? currentSystemScheme() === 'dark' : prev === 'dark';
      const next = currentlyDark ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);
  // Product-controlled visual identity: theme color, grid, and icon style are not user-configurable.
  const setGridStyle = useCallback(() => {}, []);
  const setIconStyle = useCallback(() => {}, []);

  const value = useMemo(() => {
    const resolvedMode = mode === 'system' ? systemScheme : mode;
    const palette = getPalette(resolvedMode, role);
    return {
      mode, resolvedMode, role, colors: palette,
      brandGradient: brandGradientFor(palette),
      isDark: resolvedMode === 'dark', isSystemMode: mode === 'system',
      setMode, toggleMode, roleThemes, roleList,
      gridStyle, setGridStyle, gridStyles, gridStyleList,
      iconStyle, setIconStyle, iconStyles, iconStyleList,
      loaded,
    };
  }, [mode, systemScheme, role, gridStyle, iconStyle, loaded, setMode, toggleMode, setGridStyle, setIconStyle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
export function useThemeColors() { return useContext(ThemeContext).colors; }
export default ThemeContext;
