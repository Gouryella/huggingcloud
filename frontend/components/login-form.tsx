'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { CheckCircle2, Eye, EyeOff, Fingerprint, Lock, Mail } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ApiError, clientApiFetch } from '@/lib/api';
import type { LoginOptions, PasskeyOptionsResponse, UserMe } from '@/lib/types';

type LoginRedirectTarget = '/files' | '/setup/root-admin';

interface LoginFormProps {
  initialRedirectTo?: LoginRedirectTarget | null;
}

const REDIRECT_DELAY_MS = 900;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function LoginForm({ initialRedirectTo = null }: LoginFormProps) {
  const router = useRouter();
  const { t } = useAppPreferences();
  const reduceMotion = useReducedMotion();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [persistSession, setPersistSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPasskey, setLoadingPasskey] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [redirectingTo, setRedirectingTo] = useState<LoginRedirectTarget | null>(initialRedirectTo);
  const [redirectProgress, setRedirectProgress] = useState(0);
  const redirectedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectRafRef = useRef<number | null>(null);

  const startRedirect = useCallback((target: LoginRedirectTarget) => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    setRedirectingTo(target);
    setRedirectProgress(0);
    redirectRafRef.current = requestAnimationFrame(() => {
      setRedirectProgress(100);
    });
    redirectTimerRef.current = setTimeout(() => {
      router.replace(target);
      router.refresh();
    }, REDIRECT_DELAY_MS);
  }, [router]);

  useEffect(() => {
    let active = true;
    if (initialRedirectTo) {
      startRedirect(initialRedirectTo);
      return () => {
        active = false;
        if (redirectTimerRef.current) {
          clearTimeout(redirectTimerRef.current);
          redirectTimerRef.current = null;
        }
        if (redirectRafRef.current !== null) {
          cancelAnimationFrame(redirectRafRef.current);
          redirectRafRef.current = null;
        }
      };
    }
    clientApiFetch<UserMe>('/api/me')
      .then((me) => {
        if (!active || redirectedRef.current) return;
        const redirectTarget: LoginRedirectTarget = me.force_root_admin_setup ? '/setup/root-admin' : '/files';
        startRedirect(redirectTarget);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          return;
        }
      });
    return () => {
      active = false;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      if (redirectRafRef.current !== null) {
        cancelAnimationFrame(redirectRafRef.current);
        redirectRafRef.current = null;
      }
    };
  }, [initialRedirectTo, startRedirect]);

  useEffect(() => {
    let active = true;
    clientApiFetch<LoginOptions>('/api/auth/login-options')
      .then((options) => {
        if (!active) return;
        setPasskeyEnabled(Boolean(options.passkey_enabled));
      })
      .catch(() => {
        if (!active) return;
        setPasskeyEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await clientApiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, persist_session: persistSession })
      });
      toast.success(t('login.success'));
      router.push('/files');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(t('login.failed'));
    } finally {
      setLoading(false);
    }
  }

  async function onPasskeyLogin() {
    const normalizedIdentifier = identifier.trim();

    setLoadingPasskey(true);
    try {
      const runPasskeyFlow = async (allowFallback: boolean) => {
        const payload: Record<string, unknown> = {
          allow_non_icloud_fallback: allowFallback,
        };
        if (normalizedIdentifier) {
          payload.identifier = normalizedIdentifier;
        }
        const optionsResult = await clientApiFetch<PasskeyOptionsResponse>('/api/auth/passkeys/authenticate/options', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const assertion = await startAuthentication({
          optionsJSON: optionsResult.options as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'],
        });
        await clientApiFetch('/api/auth/passkeys/authenticate/verify', {
          method: 'POST',
          body: JSON.stringify({
            challenge_id: optionsResult.challenge_id,
            credential: assertion,
            persist_session: persistSession,
          }),
        });
      };

      try {
        await runPasskeyFlow(false);
      } catch (err) {
        if (
          err instanceof ApiError &&
          err.status === 401 &&
          (err.message.includes('does not match requested account') || err.message.includes('passkey credential not found'))
        ) {
          toast.info(t('login.passkeyFallbackNotice'));
          await runPasskeyFlow(true);
        } else {
          throw err;
        }
      }
      toast.success(t('login.success'));
      router.push('/files');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error(t('login.passkeyFailed'));
      }
    } finally {
      setLoadingPasskey(false);
    }
  }

  const isRedirecting = Boolean(redirectingTo);
  const statusDescription = redirectingTo === '/setup/root-admin' ? t('login.redirectingToSetup') : t('login.redirectingToFiles');

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.46, ease: EASE_OUT }}
      className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[1.1fr_1fr]"
    >
      {isRedirecting ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.26, ease: EASE_OUT }}
          className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-card/80 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.996 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: EASE_OUT }}
            className="w-full max-w-sm rounded-xl border border-border bg-background/95 p-5 shadow-sm"
          >
            <Badge variant="secondary" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('login.redirectingLabel')}
            </Badge>
            <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground">{t('login.alreadySignedIn')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{statusDescription}</p>
            <Progress
              value={redirectProgress}
              className="mt-4 h-1.5 bg-muted [&>div]:bg-foreground/90 [&>div]:duration-700"
            />
          </motion.div>
        </motion.div>
      ) : null}

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: -22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduceMotion ? { duration: 0 } : { delay: 0.06, duration: 0.42, ease: EASE_OUT }}
        className="hidden border-r border-border bg-muted/50 p-8 lg:flex lg:flex-col lg:justify-between"
      >
        <div>
          <div className="inline-flex items-center gap-2">
            <span className="relative h-11 w-11 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <Image src="/icons/icon-192.png" alt={t('app.name')} fill className="object-contain p-1" sizes="44px" priority />
            </span>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('app.name')}</p>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{t('login.consoleTitle')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('login.consoleSubtitle')}</p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('login.step1')}</p>
          <p>{t('login.step2')}</p>
          <p>{t('login.step3')}</p>
        </div>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, x: 22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduceMotion ? { duration: 0 } : { delay: 0.1, duration: 0.42, ease: EASE_OUT }}
        className="p-6 md:p-8"
      >
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { delay: 0.16, duration: 0.34, ease: EASE_OUT }}
          className="mb-5"
        >
          <div className="mb-3 inline-flex items-center gap-2 lg:hidden">
            <span className="relative h-9 w-9 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <Image src="/icons/icon-192.png" alt={t('app.name')} fill className="object-contain p-0.5" sizes="36px" priority />
            </span>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('app.name')}</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('login.signIn')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('login.signInHint')}</p>
        </motion.div>

        <motion.form
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { delay: 0.22, duration: 0.36, ease: EASE_OUT }}
          className="mt-4 space-y-3"
          onSubmit={onPasswordLogin}
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.26, duration: 0.28, ease: EASE_OUT }}
            className="relative"
          >
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              type="text"
              placeholder={t('login.emailOrUsername')}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading || loadingPasskey || isRedirecting}
              autoComplete="username"
              required
            />
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.31, duration: 0.28, ease: EASE_OUT }}
            className="relative"
          >
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-10"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('login.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || loadingPasskey || isRedirecting}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              disabled={loading || loadingPasskey || isRedirecting}
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.36, duration: 0.28, ease: EASE_OUT }}
          >
            <label
              htmlFor="persist-session"
              className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-0.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Checkbox
                id="persist-session"
                checked={persistSession}
                onCheckedChange={(checked) => setPersistSession(checked === true)}
                disabled={loading || loadingPasskey || isRedirecting}
              />
              <span>{t('login.persistSession')}</span>
            </label>
          </motion.div>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { delay: 0.4, duration: 0.28, ease: EASE_OUT }}
          >
            <Button className="w-full" disabled={loading || loadingPasskey || isRedirecting} type="submit">
              {t('login.loginButton')}
            </Button>
          </motion.div>
          {passkeyEnabled ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: 0.44, duration: 0.28, ease: EASE_OUT }}
              className="space-y-2"
            >
              <Button
                className="w-full"
                variant="outline"
                disabled={loading || loadingPasskey || isRedirecting}
                type="button"
                onClick={() => void onPasskeyLogin()}
              >
                <Fingerprint className="mr-1.5 h-4 w-4" />
                {loadingPasskey ? t('login.passkeyLoggingIn') : t('login.passkeyLoginButton')}
              </Button>
            </motion.div>
          ) : null}
        </motion.form>
      </motion.div>
    </motion.div>
  );
}
