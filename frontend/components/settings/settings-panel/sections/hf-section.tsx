'use client';

import type { FormEventHandler } from 'react';
import { CloudCog, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DownloadMode, HFRepoType } from '@/lib/types';

import { DOWNLOAD_MODES, HF_REPO_TYPES } from '../constants';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function HFSection({
  t,
  canManageSystemSettings,
  hfRepoId,
  hfRepoType,
  hfRevision,
  downloadMode,
  hfTokenInput,
  hfTokenMasked,
  hasHFToken,
  savingHF,
  onHFRepoIdChange,
  onHFRepoTypeChange,
  onHFRevisionChange,
  onDownloadModeChange,
  onHFTokenInputChange,
  onOpenClearTokenDialog,
  onSubmit,
}: {
  t: TranslateFn;
  canManageSystemSettings: boolean;
  hfRepoId: string;
  hfRepoType: HFRepoType;
  hfRevision: string;
  downloadMode: DownloadMode;
  hfTokenInput: string;
  hfTokenMasked: string | null;
  hasHFToken: boolean;
  savingHF: boolean;
  onHFRepoIdChange: (value: string) => void;
  onHFRepoTypeChange: (value: HFRepoType) => void;
  onHFRevisionChange: (value: string) => void;
  onDownloadModeChange: (value: DownloadMode) => void;
  onHFTokenInputChange: (value: string) => void;
  onOpenClearTokenDialog: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <section id="settings-hf" className="scroll-mt-24 rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('settings.hfTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.hfSubtitle')}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
          <CloudCog className="h-4 w-4 text-foreground/80" />
        </span>
      </div>

      <div className="px-5 pb-5 pt-4">
        {!canManageSystemSettings ? (
          <div className="rounded-lg border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            {t('settings.hfReadonlyHint')}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="settings-hf-repo-id" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('settings.hfRepoId')}
                </label>
                <Input
                  id="settings-hf-repo-id"
                  name="hf_repo_id"
                  value={hfRepoId}
                  onChange={(e) => onHFRepoIdChange(e.target.value)}
                  placeholder="org/repo"
                  disabled={savingHF}
                  required
                />
              </div>

              <div>
                <label htmlFor="settings-hf-repo-type" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('settings.hfRepoType')}
                </label>
                <Select value={hfRepoType} onValueChange={(value) => onHFRepoTypeChange(value as HFRepoType)} disabled={savingHF}>
                  <SelectTrigger id="settings-hf-repo-type" aria-label={t('settings.hfRepoType')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HF_REPO_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="settings-hf-revision" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('settings.hfRevision')}
                </label>
                <Input
                  id="settings-hf-revision"
                  name="hf_revision"
                  value={hfRevision}
                  onChange={(e) => onHFRevisionChange(e.target.value)}
                  placeholder="main"
                  disabled={savingHF}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="settings-download-mode" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('settings.downloadMode')}
                </label>
                <Select
                  value={downloadMode}
                  onValueChange={(value) => onDownloadModeChange(value as DownloadMode)}
                  disabled={savingHF}
                >
                  <SelectTrigger id="settings-download-mode" aria-label={t('settings.downloadMode')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOWNLOAD_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(`settings.downloadModeOption.${mode}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">{t(`settings.downloadModeHint.${downloadMode}`)}</p>
              </div>
            </div>

            <div>
              <label htmlFor="settings-hf-token" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {t('settings.hfToken')}
              </label>
              <Input
                id="settings-hf-token"
                name="hf_token"
                type="password"
                autoComplete="off"
                value={hfTokenInput}
                onChange={(e) => onHFTokenInputChange(e.target.value)}
                placeholder={t('settings.hfTokenPlaceholder')}
                disabled={savingHF}
              />

              <div className="mt-2 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {hasHFToken
                    ? t('settings.hfTokenMasked', { token: hfTokenMasked || '****' })
                    : t('settings.hfTokenNotSet')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.hfTokenHint')}</p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" disabled={savingHF || !hasHFToken} onClick={onOpenClearTokenDialog}>
                {t('settings.hfClearToken')}
              </Button>
              <Button type="submit" disabled={savingHF}>
                {savingHF ? t('settings.hfSaving') : t('settings.hfSaveButton')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
