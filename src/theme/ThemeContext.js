import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPalette, accentThemes, accentList, DEFAULT_ACCENT, gridStyles, gridStyleList, DEFAULT_GRID_STYLE } from './theme';

const STORAGE_KEY = 'mysheba.themeMode';
const ACCENT_STORAGE_KEY = 'mysheba.themeAccent';
const GRID_STYLE_STORAGE_KEY = 'mysheba.gridStyle';
const ICON_STYLE_STORAGE_KEY = 'mysheba.iconStyle';

// Icon styles only change the presentation/iconography of service tiles.
// They never change the service action or any provider/country branding.
export const iconStyles = {
  classic: { label: 'Classic', description: 'Familiar service icons with a clean look.' },
  modern: { label: 'Modern', description: 'Simple contemporary icons matched to each service.' },
  filled: { label: 'Filled', description: 'Bold filled symbols for quick recognition.' },
  outline: { label: 'Outline', description: 'Lightweight outline-style service symbols.' },
  playful: { label: 'Playful', description: 'Friendly expressive icons, still matched to the service.' },
  compact: { label: 'Compact', description: 'Small, simple symbols for a tighter visual style.' },
};
export const iconStyleList = Object.keys(iconStyles);
export const DEFAULT_ICON_STYLE = 'classic';

function currentSystemScheme() { return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'; }
const initialSystemScheme = currentSystemScheme();

const ThemeContext = createContext({
  mode: 'system', resolvedMode: initialSystemScheme,
  accent: DEFAULT_ACCENT,
  colors: getPalette(initialSystemScheme, DEFAULT_ACCENT),
  brandGradient: [getPalette(initialSystemScheme, DEFAULT_ACCENT).primary, getPalette(initialSystemScheme, DEFAULT_ACCENT).secondary],
  isDark: initialSystemScheme === 'dark', isSystemMode: true,
  setMode: () => {}, toggleMode: () => {}, setAccent: () => {}, accentThemes, accentList,
  gridStyle: DEFAULT_GRID_STYLE, setGridStyle: () => {}, gridStyles, gridStyleList,
  iconStyle: DEFAULT_ICON_STYLE, setIconStyle: () => {}, iconStyles, iconStyleList,
});

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('system');
  const [systemScheme, setSystemScheme] = useState(initialSystemScheme);
  const [accent, setAccentState] = useState(DEFAULT_ACCENT);
  const [gridStyle, setGridStyleState] = useState(DEFAULT_GRID_STYLE);
  const [iconStyle, setIconStyleState] = useState(DEFAULT_ICON_STYLE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(ACCENT_STORAGE_KEY),
      AsyncStorage.getItem(GRID_STYLE_STORAGE_KEY),
      AsyncStorage.getItem(ICON_STYLE_STORAGE_KEY),
    ]).then(([savedMode, savedAccent, savedGridStyle, savedIconStyle]) => {
      if (cancelled) return;
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') setModeState(savedMode);
      if (savedAccent && accentThemes[savedAccent]) setAccentState(savedAccent);
      if (savedGridStyle && gridStyles[savedGridStyle]) setGridStyleState(savedGridStyle);
      if (savedIconStyle && iconStyles[savedIconStyle]) setIconStyleState(savedIconStyle);
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
  const setAccent = useCallback((next) => {
    if (!accentThemes[next]) return;
    setAccentState(next); AsyncStorage.setItem(ACCENT_STORAGE_KEY, next).catch(() => {});
  }, []);
  const setGridStyle = useCallback((next) => {
    if (!gridStyles[next]) return;
    setGridStyleState(next); AsyncStorage.setItem(GRID_STYLE_STORAGE_KEY, next).catch(() => {});
  }, []);
  const setIconStyle = useCallback((next) => {
    if (!iconStyles[next]) return;
    setIconStyleState(next); AsyncStorage.setItem(ICON_STYLE_STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const resolvedMode = mode === 'system' ? systemScheme : mode;
    const palette = getPalette(resolvedMode, accent);
    return {
      mode, resolvedMode, accent, colors: palette,
      brandGradient: [palette.primary, palette.secondary],
      isDark: resolvedMode === 'dark', isSystemMode: mode === 'system',
      setMode, toggleMode, setAccent, accentThemes, accentList,
      gridStyle, setGridStyle, gridStyles, gridStyleList,
      iconStyle, setIconStyle, iconStyles, iconStyleList,
      loaded,
    };
  }, [mode, systemScheme, accent, gridStyle, iconStyle, loaded, setMode, toggleMode, setAccent, setGridStyle, setIconStyle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
export function useThemeColors() { return useContext(ThemeContext).colors; }
export default ThemeContext;
