'use client';

import type { FormEventHandler } from 'react';
import { HardDrive } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function StorageSection({
  t,
  canManageSystemSettings,
  storageCapacityGB,
  effectiveStorageCapacityGB,
  effectiveStorageCapacityBytes,
  savingStorage,
  onStorageCapacityGBChange,
  onSubmit,
}: {
  t: TranslateFn;
  canManageSystemSettings: boolean;
  storageCapacityGB: string;
  effectiveStorageCapacityGB: number;
  effectiveStorageCapacityBytes: number;
  savingStorage: boolean;
  onStorageCapacityGBChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <section id="settings-storage" className="scroll-mt-24 rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('settings.storageTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.storageSubtitle')}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
          <HardDrive className="h-4 w-4 text-foreground/80" />
        </span>
      </div>

      <div className="px-5 pb-5 pt-4">
        {!canManageSystemSettings ? (
          <div className="rounded-lg border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
            {t('settings.storageReadonlyHint')}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="settings-storage-capacity-gb" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.storageCapacityGB')}
              </label>
              <Input
                id="settings-storage-capacity-gb"
                name="private_storage_capacity_gb"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={storageCapacityGB}
                onChange={(e) => onStorageCapacityGBChange(e.target.value)}
                disabled={savingStorage}
                required
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t('settings.storageCapacityGB')}</p>
              <p className="mt-1 font-mono text-xs text-foreground">
                {t('settings.storageCapacityPreview', {
                  capacityGb: effectiveStorageCapacityGB.toLocaleString(),
                  capacityBytes: effectiveStorageCapacityBytes.toLocaleString(),
                })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{t('settings.storageCapacityHint')}</p>
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" size="sm" disabled={savingStorage}>
                {savingStorage ? t('settings.storageSaving') : t('settings.storageSaveButton')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
