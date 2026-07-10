'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import fr from '@/messages/fr.json';

export type Locale = 'en' | 'ar' | 'fr';

const messages: Record<Locale, any> = { en, ar, fr };

type TranslateParams = Record<string, string | number>;

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: TranslateParams) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (k) => k,
  dir: 'ltr',
});

function interpolate(str: string, params?: TranslateParams): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (match, k) => (params[k] !== undefined ? String(params[k]) : match));
}

// Only ever returns a string: a key that resolves to an object (namespace
// collision) or undefined (missing key) both fall back to the raw path
// instead of leaking a non-string value into React.
function resolve(obj: any, path: string, params?: TranslateParams): string {
  const value = path.split('.').reduce((cur, k) => (cur && typeof cur === 'object' ? cur[k] : undefined), obj);
  return typeof value === 'string' ? interpolate(value, params) : path;
}

function applyLocaleToDocument(l: Locale) {
  const html = document.documentElement;
  html.setAttribute('lang', l);
  html.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
  html.classList.toggle('font-arabic', l === 'ar');
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = localStorage.getItem('admin-locale') as Locale | null;
    if (stored && messages[stored]) {
      setLocaleState(stored);
      applyLocaleToDocument(stored);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('admin-locale', l);
    applyLocaleToDocument(l);
  };

  const t = (key: string, params?: TranslateParams) => resolve(messages[locale], key, params);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
