import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './translations/en';
import bn from './translations/bn';
import ms from './translations/ms';
import hi from './translations/hi';
import ne from './translations/ne';
import ur from './translations/ur';
import ta from './translations/ta';
import faqTranslations from './faqTranslations';

const STORAGE_KEY = 'mysheba.language';

export const TRANSLATIONS = { en, bn, ms, hi, ne, ur, ta };

export const LANGUAGES = {
  en: { label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  bn: { label: 'Bangla', nativeLabel: 'বাংলা', flag: '🇧🇩' },
  ms: { label: 'Malay', nativeLabel: 'Bahasa Melayu', flag: '🇲🇾' },
  hi: { label: 'Hindi', nativeLabel: 'हिन्दी', flag: '🇮🇳' },
  ne: { label: 'Nepali', nativeLabel: 'नेपाली', flag: '🇳🇵' },
  ur: { label: 'Urdu', nativeLabel: 'اردو', flag: '🇵🇰' },
  ta: { label: 'Tamil', nativeLabel: 'தமிழ்', flag: '🇱🇰' },
};
export const LANGUAGE_LIST = Object.keys(LANGUAGES);
const DEFAULT_LANGUAGE = 'en';

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

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
  faq: faqTranslations[DEFAULT_LANGUAGE],
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
    faq: faqTranslations[language] || faqTranslations[DEFAULT_LANGUAGE],
    loaded,
  }), [language, setLanguage, t, loaded]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export default LanguageContext;
