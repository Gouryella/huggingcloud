'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { ApiError, clientApiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type SetupField = 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<SetupField, string>>;

const PASSWORD_MIN_LENGTH = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function joinDescribedBy(...ids: Array<string | false | undefined>) {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

export function SetupRootAdminForm() {
  const { t } = useAppPreferences();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const checklistItems = [t('setupRoot.checkIdentity'), t('setupRoot.checkPassword'), t('setupRoot.checkHandover')];

  function clearFieldError(field: SetupField) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validateForm(nextEmail: string, nextPassword: string, nextConfirmPassword: string): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (!nextEmail) nextErrors.email = t('setupRoot.emailRequired');
    else if (!EMAIL_PATTERN.test(nextEmail)) nextErrors.email = t('setupRoot.emailInvalid');

    if (nextPassword.length < PASSWORD_MIN_LENGTH) nextErrors.password = t('setupRoot.passwordLength');
    if (nextPassword !== nextConfirmPassword) nextErrors.confirmPassword = t('setupRoot.passwordMismatch');
    return nextErrors;
  }

  function focusFirstError(nextErrors: FieldErrors) {
    if (nextErrors.email) {
      emailRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }
    if (nextErrors.confirmPassword) {
      confirmPasswordRef.current?.focus();
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalizedEmail = email.trim();
    const normalizedUsername = username.trim();
    const nextErrors = validateForm(normalizedEmail, password, confirmPassword);
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstError(nextErrors);
      toast.error(t('setupRoot.fixErrors'));
      return;
    }

    setFieldErrors({});
    setEmail(normalizedEmail);
    setUsername(normalizedUsername);

    setLoading(true);
    try {
      await clientApiFetch('/api/setup/root-admin', {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
          username: normalizedUsername || null,
          password
        })
      });
      toast.success(t('setupRoot.created'));
      router.push('/files');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(t('setupRoot.createFailed'));
    } finally {
      setLoading(false);
    }
  }

  const errorCount = Object.keys(fieldErrors).length;

  return (
    <div className="setup-animate-card relative w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="setup-animate-item setup-delay-1 hidden border-r border-border bg-muted/50 p-8 lg:flex lg:flex-col lg:justify-between">
        <div>
          <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs">
            {t('setupRoot.badge')}
          </Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{t('setupRoot.title')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('setupRoot.subtitle')}</p>
        </div>
        <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {checklistItems.map((item, index) => (
            <li key={item} className="setup-animate-item" style={{ animationDelay: `${220 + index * 60}ms` }}>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="setup-animate-item setup-delay-2 p-6 md:p-8">
        <div className="setup-animate-item setup-delay-1 mb-5 lg:hidden">
          <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs">
            {t('setupRoot.badge')}
          </Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{t('setupRoot.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('setupRoot.subtitle')}</p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {errorCount > 0 ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t('setupRoot.fixErrors')}
            </p>
          ) : null}

          <div className="setup-animate-item setup-delay-3">
            <label htmlFor="setup-root-email" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('setupRoot.ownerEmail')}
            </label>
            <Input
              ref={emailRef}
              id="setup-root-email"
              name="email"
              className={cn(fieldErrors.email && 'border-destructive focus-visible:ring-destructive')}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('setupRoot.ownerEmailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'setup-root-email-error' : undefined}
              required
            />
            {fieldErrors.email ? (
              <p id="setup-root-email-error" className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="setup-animate-item setup-delay-4">
            <label htmlFor="setup-root-username" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('setupRoot.usernameOptional')}
            </label>
            <Input
              id="setup-root-username"
              name="username"
              placeholder={t('setupRoot.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby="setup-root-username-hint"
            />
            <p id="setup-root-username-hint" className="mt-1 text-xs text-muted-foreground">
              {t('setupRoot.usernameRule')}
            </p>
          </div>

          <div className="setup-animate-item setup-delay-5">
            <label htmlFor="setup-root-password" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('setupRoot.passwordLabel')}
            </label>
            <Input
              ref={passwordRef}
              id="setup-root-password"
              name="password"
              className={cn(fieldErrors.password && 'border-destructive focus-visible:ring-destructive')}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={t('setupRoot.passwordPlaceholder')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={joinDescribedBy('setup-root-password-rule', fieldErrors.password && 'setup-root-password-error')}
              required
            />
            <p id="setup-root-password-rule" className="mt-1 text-xs text-muted-foreground">
              {t('setupRoot.passwordRule')}
            </p>
            {fieldErrors.password ? (
              <p id="setup-root-password-error" className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <div className="setup-animate-item setup-delay-6">
            <label htmlFor="setup-root-confirm-password" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('setupRoot.confirmPassword')}
            </label>
            <Input
              ref={confirmPasswordRef}
              id="setup-root-confirm-password"
              name="confirmPassword"
              className={cn(fieldErrors.confirmPassword && 'border-destructive focus-visible:ring-destructive')}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={t('setupRoot.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError('confirmPassword');
              }}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? 'setup-root-confirm-password-error' : undefined}
              required
            />
            {fieldErrors.confirmPassword ? (
              <p id="setup-root-confirm-password-error" className="mt-1 text-xs text-destructive" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <div className="setup-animate-item setup-delay-6 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground lg:hidden">
            <ul className="list-disc space-y-1 pl-4">
              {checklistItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <Button className="setup-animate-item setup-delay-7 mt-1 w-full touch-manipulation" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('setupRoot.creating')}
              </>
            ) : (
              t('setupRoot.createRootAdmin')
            )}
          </Button>

          <p aria-live="polite" className="sr-only">
            {loading ? t('setupRoot.creating') : errorCount > 0 ? t('setupRoot.fixErrors') : ''}
          </p>
        </form>
      </section>
    </div>
  );
}
