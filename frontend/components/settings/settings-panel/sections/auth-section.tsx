'use client';

import type { FormEventHandler } from 'react';
import { LogIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import { LOGIN_PERSISTENCE_TTL_HOURS_MAX, LOGIN_PERSISTENCE_TTL_HOURS_MIN } from '../constants';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function AuthSection({
  t,
  canManageSystemSettings,
  savingAuth,
  loginPersistenceTTLHours,
  effectiveLoginPersistenceTTLHours,
  effectiveLoginPersistenceTTLDays,
  passkeyEnabledDraft,
  onLoginPersistenceTTLHoursChange,
  onPasskeyEnabledDraftChange,
  onSubmit,
}: {
  t: TranslateFn;
  canManageSystemSettings: boolean;
  savingAuth: boolean;
  loginPersistenceTTLHours: number;
  effectiveLoginPersistenceTTLHours: number;
  effectiveLoginPersistenceTTLDays: string;
  passkeyEnabledDraft: boolean;
  onLoginPersistenceTTLHoursChange: (hours: number) => void;
  onPasskeyEnabledDraftChange: (enabled: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <section id="settings-auth" className="scroll-mt-24 rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('settings.authTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.authSubtitle')}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
          <LogIn className="h-4 w-4 text-foreground/80" />
        </span>
      </div>

      <div className="px-5 pb-5 pt-4">
        {!canManageSystemSettings ? (
          <div className="rounded-lg border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            {t('settings.authReadonlyHint')}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="settings-login-persistence-ttl-hours" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.loginPersistenceTTLHours')}
              </label>
              <input
                id="settings-login-persistence-ttl-hours"
                name="login_persistence_ttl_hours"
                type="range"
                min={LOGIN_PERSISTENCE_TTL_HOURS_MIN}
                max={LOGIN_PERSISTENCE_TTL_HOURS_MAX}
                step={1}
                value={loginPersistenceTTLHours}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10);
                  if (!Number.isFinite(next)) return;
                  onLoginPersistenceTTLHoursChange(next);
                }}
                disabled={savingAuth}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />

              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('settings.loginPersistenceTTLMin')}</span>
                <span>{t('settings.loginPersistenceTTLMax')}</span>
              </div>

              <p className="mt-2 text-sm font-medium text-foreground">
                {t('settings.loginPersistenceTTLSummary', {
                  hours: effectiveLoginPersistenceTTLHours.toLocaleString(),
                  days: effectiveLoginPersistenceTTLDays,
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.loginPersistenceTTLHint', {
                  hours: effectiveLoginPersistenceTTLHours.toLocaleString(),
                })}
              </p>
            </div>

            <label htmlFor="settings-passkey-enabled" className="flex items-start gap-3 rounded-lg border bg-muted/15 px-3 py-2.5">
              <Checkbox
                id="settings-passkey-enabled"
                checked={passkeyEnabledDraft}
                onCheckedChange={(checked) => onPasskeyEnabledDraftChange(checked === true)}
                disabled={savingAuth}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{t('settings.passkeyEnableLabel')}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t('settings.passkeyEnableHint')}</span>
              </span>
            </label>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" size="sm" disabled={savingAuth}>
                {savingAuth ? t('settings.authSaving') : t('settings.authSaveButton')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
