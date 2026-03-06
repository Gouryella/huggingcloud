'use client';

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { createTranslator, resolveLocale, resolveTheme, type Locale, type ThemeMode } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'hugging_cloud.locale';
const THEME_STORAGE_KEY = 'hugging_cloud.theme';
type ResolvedTheme = 'light' | 'dark';

type AppPreferencesContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function AppPreferencesProvider({
  initialLocale,
  initialTheme,
  children,
}: {
  initialLocale: Locale;
  initialTheme: ThemeMode;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(resolveLocale(initialLocale));
  const [theme, setThemeState] = useState<ThemeMode>(resolveTheme(initialTheme));
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (storedLocale) {
      setLocaleState(resolveLocale(storedLocale));
    }
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme) {
      setThemeState(resolveTheme(storedTheme));
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    updateSystemTheme();

    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    setCookie('locale', locale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
    root.dataset.themeMode = theme;
    setCookie('theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, resolvedTheme]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(resolveLocale(nextLocale));
  }, []);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(resolveTheme(nextTheme));
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      locale,
      setLocale,
      theme,
      resolvedTheme,
      setTheme,
      t,
    }),
    [locale, setLocale, theme, resolvedTheme, setTheme, t],
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}
