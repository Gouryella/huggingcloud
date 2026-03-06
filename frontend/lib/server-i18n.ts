import { cookies } from 'next/headers';

import { createTranslator, resolveLocale, type Locale } from '@/lib/i18n';

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get('locale')?.value);
}

export async function getServerTranslator() {
  const locale = await getServerLocale();
  return {
    locale,
    t: createTranslator(locale),
  };
}
