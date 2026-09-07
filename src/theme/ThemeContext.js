import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPalette, accentThemes, accentList, DEFAULT_ACCENT, gridStyles, gridStyleList, DEFAULT_GRID_STYLE } from './theme';

// Persists the user's display-mode choice across app restarts. Three
// possible stored values: 'light', 'dark' (explicit, ignore the OS from
// then on - MySheba's own in-app override), or 'system' (follow the
// device's Appearance setting live, including if the user flips it while
// the app is open, e.g. Android's scheduled dark theme kicking in at
// sunset). Brand new installs with nothing saved yet default to 'system'
// rather than freezing a one-time OS guess, since that's the more useful
// default now that a real system-follow mode exists. Existing installs
// that already have an explicit 'light' or 'dark' saved from before this
// mode existed are left exactly as they were - this only changes the
// *fresh-install* default, never a value a user already chose.
const STORAGE_KEY = 'mysheba.themeMode';
// Separate key for the accent color pick (Teal/Ocean Blue/Royal Purple/
// Rose/Amber/Emerald - see accentThemes in ./theme). Independent of
// light/dark/system mode: a user can be on system mode with the Rose
// accent, etc.
const ACCENT_STORAGE_KEY = 'mysheba.themeAccent';
// Separate key for the grid tile style pick ('bordered' or 'classic' - see
// gridStyles in ./theme). Independent of mode/accent: any combination of
// display mode, accent color, and grid style can be chosen together.
const GRID_STYLE_STORAGE_KEY = 'mysheba.gridStyle';

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
});

export function ThemeProvider({ children }) {
  // Provisional guess for the very first render, before AsyncStorage has
  // been read. Corrected below once the read resolves: if a saved
  // light/dark/system value exists it's applied as-is; if nothing is
  // saved (fresh install) this 'system' default is simply kept.
  const [mode, setModeState] = useState('system');
  // Live OS scheme, kept in sync via Appearance's change listener so
  // 'system' mode reacts immediately rather than only on next app launch.
  const [systemScheme, setSystemScheme] = useState(initialSystemScheme);
  const [accent, setAccentState] = useState(DEFAULT_ACCENT);
  const [gridStyle, setGridStyleState] = useState(DEFAULT_GRID_STYLE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(ACCENT_STORAGE_KEY),
      AsyncStorage.getItem(GRID_STYLE_STORAGE_KEY),
    ]).then(([savedMode, savedAccent, savedGridStyle]) => {
      if (cancelled) return;
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
        setModeState(savedMode);
      }
      if (savedAccent && accentThemes[savedAccent]) setAccentState(savedAccent);
      if (savedGridStyle && gridStyles[savedGridStyle]) setGridStyleState(savedGridStyle);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  // Subscribe to OS appearance changes for the lifetime of the provider
  // (cheap to keep running even outside 'system' mode - resolvedMode below
  // simply ignores systemScheme unless mode === 'system').
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  const setMode = useCallback((next) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  // Quick light/dark flip (Profile screen's sun/moon button). Judges
  // "currently dark" off whatever's actually resolved - including when
  // mode is 'system' - so tapping it always flips away from what's on
  // screen right now, and always lands on an explicit light/dark choice
  // (leaving system-follow, same as touching a light/dark switch does in
  // most apps' OS-level settings).
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
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_STORAGE_KEY, next).catch(() => {});
  }, []);

  const setGridStyle = useCallback((next) => {
    if (!gridStyles[next]) return;
    setGridStyleState(next);
    AsyncStorage.setItem(GRID_STYLE_STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => {
    // resolvedMode is what's actually rendered: the explicit choice, or
    // the live OS scheme when following system. Everything downstream
    // (palette, isDark, brandGradient) is derived from this, never from
    // the raw `mode` preference directly, so 'system' can never leak
    // through as an unhandled third value anywhere else in the app.
    const resolvedMode = mode === 'system' ? systemScheme : mode;
    const palette = getPalette(resolvedMode, accent);
    return {
      mode,
      resolvedMode,
      accent,
      colors: palette,
      brandGradient: [palette.primary, palette.secondary],
      isDark: resolvedMode === 'dark',
      isSystemMode: mode === 'system',
      setMode,
      toggleMode,
      setAccent,
      accentThemes,
      accentList,
      gridStyle,
      setGridStyle,
      gridStyles,
      gridStyleList,
      loaded,
    };
  }, [mode, systemScheme, accent, gridStyle, loaded, setMode, toggleMode, setAccent, setGridStyle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Full theme object: { mode, resolvedMode, colors, brandGradient, isDark,
// isSystemMode, setMode, toggleMode, accent, setAccent, accentThemes,
// accentList }
export function useTheme() {
  return useContext(ThemeContext);
}

// Convenience hook for the common case of just wanting the current
// palette (mirrors the old `import { colors } from theme/theme` usage).
export function useThemeColors() {
  return useContext(ThemeContext).colors;
}

export default ThemeContext;
