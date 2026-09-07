import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './translations/en';
import bn from './translations/bn';
import ms from './translations/ms';

// Persists the user's language choice across app restarts, same pattern as
// ThemeContext's STORAGE_KEY. Fresh installs default to English ('en')
// rather than guessing from device locale, so the very first screen a new
// user sees is never in a language they didn't ask for.
const STORAGE_KEY = 'mysheba.language';

export const TRANSLATIONS = { en, bn, ms };

export const LANGUAGES = {
  en: { label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  bn: { label: 'Bangla', nativeLabel: 'বাংলা', flag: '🇧🇩' },
  ms: { label: 'Malay', nativeLabel: 'Bahasa Melayu', flag: '🇲🇾' },
};
export const LANGUAGE_LIST = Object.keys(LANGUAGES);
const DEFAULT_LANGUAGE = 'en';

// Looks up a dot-path ('settings.title') inside a translation object.
// Returns undefined (not a crash) when a segment is missing, so the
// fallback chain in translate() below can take over cleanly.
function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

// Fills {placeholder} tokens in a translated string with values from vars,
// e.g. translate('register.otpHintEmail', 'en', { email: 'a@b.com' }).
function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// Three-step fallback: requested language -> English -> the raw key itself,
// so a missing translation never shows the user a blank space, and a typo'd
// key is at least visible/debuggable instead of silently empty.
function translate(key, language, vars) {
  const fromLang = getPath(TRANSLATIONS[language], key);
  if (typeof fromLang === 'string') return interpolate(fromLang, vars);
  const fromEnglish = getPath(TRANSLATIONS[DEFAULT_LANGUAGE], key);
  if (typeof fromEnglish === 'string') return interpolate(fromEnglish, vars);
  return key;
}

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
  languages: LANGUAGES,
  languageList: LANGUAGE_LIST,
  loaded: false,
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled) return;
        if (saved && TRANSLATIONS[saved]) setLanguageState(saved);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  const setLanguage = useCallback((next) => {
    if (!TRANSLATIONS[next]) return;
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback((key, varsOrFallback) => {
    // Second arg can be either an interpolation object ({ email: ... }) or
    // a plain fallback string for one-off strings that aren't worth adding
    // to every translations/*.js file yet - matches how useTheme()-style
    // hooks in this app keep call sites terse.
    if (typeof varsOrFallback === 'string') {
      const result = translate(key, language);
      return result === key ? varsOrFallback : result;
    }
    return translate(key, language, varsOrFallback);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    languages: LANGUAGES,
    languageList: LANGUAGE_LIST,
    loaded,
  }), [language, setLanguage, t, loaded]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export default LanguageContext;
