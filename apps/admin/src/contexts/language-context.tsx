'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import fr from '@/messages/fr.json';

export type Locale = 'en' | 'ar' | 'fr';

const messages: Record<Locale, any> = { en, ar, fr };

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (k) => k,
  dir: 'ltr',
});

function resolve(obj: any, path: string): string {
  return path.split('.').reduce((cur, k) => (cur && typeof cur === 'object' ? cur[k] : undefined), obj) ?? path;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = localStorage.getItem('admin-locale') as Locale | null;
    if (stored && messages[stored]) {
      setLocaleState(stored);
      document.documentElement.setAttribute('lang', stored);
      document.documentElement.setAttribute('dir', stored === 'ar' ? 'rtl' : 'ltr');
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('admin-locale', l);
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
  };

  const t = (key: string) => resolve(messages[locale], key);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
