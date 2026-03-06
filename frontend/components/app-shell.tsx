'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Files, Github, History, Languages, Link2, LogOut, Monitor, Moon, Settings, Sun, UploadCloud } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';

import { clientApiFetch } from '@/lib/api';
import { GITHUB_REPO, getGitHubRepoHref } from '@/lib/github';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/types';
import type { UserMe } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

const NAV_ITEMS = [
  { href: '/files', labelKey: 'nav.files', icon: Files },
  { href: '/shares', labelKey: 'nav.shares', icon: Link2 },
  { href: '/uploads', labelKey: 'nav.uploads', icon: UploadCloud },
  { href: '/audit', labelKey: 'nav.audit', icon: History },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
];

const LOCALE_LABEL_KEY: Partial<Record<Locale, string>> = {
  en: 'shell.english',
  zh: 'shell.chinese'
};

function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { locale, setLocale, theme, setTheme, t } = useAppPreferences();
  const footerDescription =
    locale === 'zh'
      ? '统一管理文件列表、分享链接、上传任务与审计日志。'
      : 'Unified access to file index, share links, upload tasks, and audit logs.';
  const githubHref = getGitHubRepoHref();
  const githubLabel = GITHUB_REPO;
  const isLogin = pathname.startsWith('/login');
  const isSetup = pathname.startsWith('/setup/root-admin');

  const [me, setMe] = useState<UserMe | null>(null);
  const reduceMotion = useReducedMotion();

  const displayName = useMemo(() => {
    if (!me) return t('shell.account');
    if (me.username) return me.username;
    if (me.email) return me.email;
    return me.id.slice(0, 8);
  }, [me, t]);

  const displaySubline = useMemo(() => {
    if (!me) return t('shell.signInRequired');
    if (me.email) return me.email;
    return `${t('shell.idPrefix')} ${me.id.slice(0, 8)}`;
  }, [me, t]);

  const initials = useMemo(() => {
    const source = (me?.username || me?.email || me?.id || 'A').trim();
    const normalized = source.replace(/[_\-.]+/g, ' ');
    const parts = normalized
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return normalized.slice(0, 2).toUpperCase();
  }, [me]);

  const avatarDisplay = useMemo(() => {
    const emoji = me?.avatar_emoji?.trim();
    if (emoji) return { value: emoji, isEmoji: true };
    return { value: initials, isEmoji: false };
  }, [initials, me?.avatar_emoji]);

  const roleDisplay = useMemo(() => {
    if (!me) return t('shell.account');
    return me.role === 'owner' ? 'root' : me.role;
  }, [me, t]);

  useEffect(() => {
    if (isLogin || isSetup) return;
    let active = true;

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string; avatar_emoji?: string }>).detail;
      setMe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          username: detail.username ?? prev.username,
          avatar_emoji: detail.avatar_emoji ?? prev.avatar_emoji,
        };
      });
    };

    window.addEventListener('app:user-profile-updated', handleProfileUpdated as EventListener);

    clientApiFetch<UserMe>('/api/me')
      .then((user) => {
        if (!active) return;
        setMe(user);
      })
      .catch(() => {
        // Ignore transient me fetch errors in shell.
      });

    return () => {
      active = false;
      window.removeEventListener('app:user-profile-updated', handleProfileUpdated as EventListener);
    };
  }, [isLogin, isSetup]);

  async function handleLogout() {
    try {
      await clientApiFetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      toast.error(t('shell.logoutFailed'));
    }
  }

  function handleLocaleSelect(nextLocale: Locale) {
    if (nextLocale === locale) return;
    document.cookie = `locale=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; samesite=lax`;
    setLocale(nextLocale);
    router.refresh();
  }

  function getLocaleLabel(localeCode: Locale) {
    const key = LOCALE_LABEL_KEY[localeCode];
    return key ? t(key) : localeCode.toUpperCase();
  }

  if (isLogin || isSetup) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/files" className="inline-flex min-w-0 items-center gap-2.5 text-[16px] font-semibold tracking-tight text-foreground md:text-[17px]">
              <span className="relative h-10 w-10 shrink-0">
                <Image src="/icons/icon-192.png" alt={t('app.name')} fill className="object-contain" sizes="40px" priority />
              </span>
              <span className="truncate">{t('app.name')}</span>
            </Link>
            <motion.nav
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="hidden items-center gap-1 md:flex"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors',
                      active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-foreground/80 hover:bg-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </motion.nav>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-border bg-card hover:bg-muted"
                  aria-label={`${t('shell.language')}: ${getLocaleLabel(locale)}`}
                >
                  <Languages className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-xl border-border p-1">
                <DropdownMenuLabel>{t('shell.language')}</DropdownMenuLabel>
                {SUPPORTED_LOCALES.map((localeCode) => (
                  <DropdownMenuItem key={localeCode} className="h-9 rounded-lg px-2.5" onSelect={() => handleLocaleSelect(localeCode)}>
                    <span>{getLocaleLabel(localeCode)}</span>
                    {locale === localeCode ? <Check className="ml-auto h-4 w-4" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 border-border bg-card hover:bg-muted" aria-label={t('shell.theme')}>
                  {theme === 'dark' ? (
                    <Moon className="h-4 w-4" />
                  ) : theme === 'light' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-xl border-border p-1">
                <DropdownMenuLabel>{t('shell.theme')}</DropdownMenuLabel>
                <DropdownMenuItem className="h-9 rounded-lg px-2.5" onSelect={() => setTheme('light')}>
                  <Sun className="mr-2 h-4 w-4" />
                  <span>{t('shell.themeLight')}</span>
                  {theme === 'light' ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem className="h-9 rounded-lg px-2.5" onSelect={() => setTheme('dark')}>
                  <Moon className="mr-2 h-4 w-4" />
                  <span>{t('shell.themeDark')}</span>
                  {theme === 'dark' ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>
                <DropdownMenuItem className="h-9 rounded-lg px-2.5" onSelect={() => setTheme('system')}>
                  <Monitor className="mr-2 h-4 w-4" />
                  <span>{t('shell.themeSystem')}</span>
                  {theme === 'system' ? <Check className="ml-auto h-4 w-4" /> : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {me ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 max-w-[280px] gap-2 rounded-full border-border/80 bg-card px-1.5 pr-2.5 shadow-sm transition-colors hover:bg-muted/70"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          avatarDisplay.isEmoji
                            ? 'bg-muted text-base leading-none'
                            : 'bg-zinc-900 text-xs font-semibold tracking-wide text-white dark:bg-zinc-100 dark:text-zinc-900'
                        )}
                      >
                        {avatarDisplay.value}
                      </span>
                      <span className="hidden min-w-0 flex-1 flex-col text-left leading-tight sm:flex">
                        <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
                        <span className="truncate text-xs capitalize text-muted-foreground">{roleDisplay}</span>
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 rounded-2xl border-border/80 bg-popover/95 p-1.5 shadow-lg backdrop-blur">
                  <DropdownMenuLabel className="p-0">
                    <div className="flex items-start gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          avatarDisplay.isEmoji
                            ? 'bg-muted text-xl leading-none'
                            : 'bg-zinc-900 text-sm font-semibold tracking-wide text-white dark:bg-zinc-100 dark:text-zinc-900'
                        )}
                      >
                        {avatarDisplay.value}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                        <p className="truncate text-xs font-normal text-muted-foreground">{displaySubline}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 rounded-full px-2.5 py-0.5 capitalize">
                        {roleDisplay}
                      </Badge>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem
                    className="h-9 rounded-lg px-2.5 text-sm"
                    onSelect={() => router.push('/settings')}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    {t('shell.accountSettings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={handleLogout}
                    className="h-9 rounded-lg px-2.5 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('shell.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9 border-border bg-card px-3 hover:bg-muted')}
              >
                {t('login.loginButton')}
              </Link>
            )}
          </div>
        </div>

        <motion.nav
          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="border-t border-border px-2 pb-2 pt-1 md:hidden"
        >
          <div className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors',
                    active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-muted/50 text-foreground/80'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
                );
              })}
          </div>
        </motion.nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="mt-auto pb-8 pt-6">
        <div className="mx-auto w-full max-w-7xl px-4">
          <section className="relative overflow-hidden rounded-[20px] border border-border/80 bg-card/85 shadow-[0_12px_32px_rgba(0,0,0,0.06)] backdrop-blur">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-500/40 to-transparent dark:via-zinc-300/40" />
            <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(circle_at_0%_0%,rgba(24,24,27,0.06),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(24,24,27,0.06),transparent_45%)] dark:[background:radial-gradient(circle_at_0%_0%,rgba(228,228,231,0.08),transparent_45%),radial-gradient(circle_at_100%_100%,rgba(228,228,231,0.08),transparent_45%)]" />

            <div className="relative grid gap-4 px-5 py-5 sm:px-6 sm:py-5 lg:grid-cols-[1.2fr_auto] lg:items-center">
              <div className="space-y-2.5">
                <div className="inline-flex items-center gap-3">
                  <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-background/80 shadow-sm">
                    <Image src="/icons/icon-192.png" alt={t('app.name')} fill className="object-contain p-0.5" sizes="32px" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold text-foreground">Hugging Cloud</p>
                    <p className="text-[11px] text-muted-foreground">{footerDescription}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-start lg:justify-end">
                <a
                  href={githubHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>Powered by</span>
                  <Github className="h-3.5 w-3.5" />
                  <span className="font-mono text-foreground">{githubLabel}</span>
                </a>
              </div>
            </div>
          </section>
        </div>
      </footer>
    </div>
  );
}
