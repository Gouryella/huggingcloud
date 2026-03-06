import { messagesEn } from '@/lib/i18n/en';
import { messagesZh } from '@/lib/i18n/zh';
import { type Locale, type MessageTree, type ThemeMode } from '@/lib/i18n/types';

export { SUPPORTED_LOCALES, SUPPORTED_THEMES, type Locale, type MessageTree, type ThemeMode } from '@/lib/i18n/types';

function getNestedMessage(tree: MessageTree, key: string): string | null {
  const parts = key.split('.');
  let current: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (!current || typeof current === 'string') return null;
    current = current[part];
  }
  return typeof current === 'string' ? current : null;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)), template);
}

export function resolveLocale(input?: string | null): Locale {
  if (!input) return 'en';
  const normalized = input.toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
}

export function resolveTheme(input?: string | null): ThemeMode {
  if (input === 'light' || input === 'dark' || input === 'system') {
    return input;
  }
  return 'system';
}

export const messages: Record<Locale, MessageTree> = {
  en: messagesEn,
  zh: messagesZh,
};

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const resolved = getNestedMessage(messages[locale], key) ?? getNestedMessage(messages.en, key) ?? key;
  return interpolate(resolved, vars);
}

export function createTranslator(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
