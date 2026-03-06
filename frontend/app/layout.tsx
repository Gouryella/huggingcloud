import './globals.css';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';

import { AppShell } from '@/components/app-shell';
import { AppPreferencesProvider } from '@/components/providers/app-preferences-provider';
import { AppToaster } from '@/components/ui/toaster';
import { resolveLocale, resolveTheme } from '@/lib/i18n';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap'
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Hugging Cloud',
  description: 'Team drive on Hugging Face',
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/icons/favicon-32.png',
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(cookieStore.get('locale')?.value);
  const initialTheme = resolveTheme(cookieStore.get('theme')?.value);

  return (
    <html lang={initialLocale} className={initialTheme === 'dark' ? 'dark' : ''} suppressHydrationWarning>
      <body className={`${manrope.variable} ${ibmPlexMono.variable}`}>
        <AppPreferencesProvider initialLocale={initialLocale} initialTheme={initialTheme}>
          <AppShell>{children}</AppShell>
          <AppToaster />
        </AppPreferencesProvider>
      </body>
    </html>
  );
}
