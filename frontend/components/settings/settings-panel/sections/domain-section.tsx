'use client';

import type { FormEventHandler } from 'react';
import { Globe2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function DomainSection({
  t,
  canManageSystemSettings,
  appDomain,
  effectiveDomain,
  savingDomains,
  onAppDomainChange,
  onSubmit,
}: {
  t: TranslateFn;
  canManageSystemSettings: boolean;
  appDomain: string;
  effectiveDomain: string;
  savingDomains: boolean;
  onAppDomainChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <section id="settings-domain" className="scroll-mt-24 rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('settings.domainTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.domainSubtitle')}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
          <Globe2 className="h-4 w-4 text-foreground/80" />
        </span>
      </div>

      <div className="px-5 pb-5 pt-4">
        {!canManageSystemSettings ? (
          <div className="rounded-lg border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            {t('settings.domainReadonlyHint')}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="settings-app-domain" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.appDomain')}
              </label>
              <Input
                id="settings-app-domain"
                name="app_domain"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={appDomain}
                onChange={(e) => onAppDomainChange(e.target.value)}
                placeholder="https://files.example.com"
                disabled={savingDomains}
                required
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t('settings.appDomain')}</p>
              <p className="mt-1 truncate font-mono text-xs text-foreground">{effectiveDomain}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t('settings.domainAutoDownloadHint')}</p>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" size="sm" disabled={savingDomains}>
                {savingDomains ? t('settings.domainSaving') : t('settings.domainSaveButton')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
