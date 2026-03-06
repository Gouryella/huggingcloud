export const SUPPORTED_LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const SUPPORTED_THEMES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof SUPPORTED_THEMES)[number];

export interface MessageTree {
  [key: string]: string | MessageTree;
}
