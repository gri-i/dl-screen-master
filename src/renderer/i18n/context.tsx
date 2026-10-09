import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Dict, Lang } from './types';

const LANG_KEY = 'dl-screen-master-lang';
const DEFAULT_LANG: Lang = 'ru';

export function readLang(): Lang {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    return stored === 'en' || stored === 'ru' ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

type Vars = Record<string, string | number>;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function LanguageProvider({ dict, children }: { dict: Record<Lang, Dict>; children: React.ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Lang>(readLang);

  useEffect(() => {
    try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  function setLang(next: Lang): void {
    setLangState(next);
  }

  function t(key: string, vars?: Vars): string {
    // Падение на ru, а затем на сам ключ — чтобы отсутствующий перевод не
    // ронял интерфейс, а был сразу виден как нетронутый ключ.
    const template = dict[lang]?.[key] ?? dict.ru[key] ?? key;
    return interpolate(template, vars);
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export function useT(): LanguageContextValue['t'] {
  return useLanguage().t;
}
