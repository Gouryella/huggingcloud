'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Theme as EmojiPickerTheme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import type { PasskeyCredentialInfo } from '@/lib/types';

import { summarizeCredentialId } from './utils';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

export function ClearHFTokenDialog({
  open,
  onOpenChange,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onConfirm: () => void;
}) {
  const { t } = useAppPreferences();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.hfClearToken')}</DialogTitle>
          <DialogDescription>{t('settings.hfClearTokenConfirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('shell.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={saving}>
            {t('settings.hfClearToken')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PasskeyDeleteDialog({
  open,
  onOpenChange,
  deletingPasskeyId,
  passkeyDeleteTarget,
  onConfirm,
  onCancel,
  getPasskeyDisplayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deletingPasskeyId: string | null;
  passkeyDeleteTarget: PasskeyCredentialInfo | null;
  onConfirm: () => void;
  onCancel: () => void;
  getPasskeyDisplayName: (passkey: PasskeyCredentialInfo) => string;
}) {
  const { t } = useAppPreferences();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (deletingPasskeyId) return;
        onOpenChange(nextOpen);
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.passkeyDeleteConfirmTitle')}</DialogTitle>
          <DialogDescription>
            {passkeyDeleteTarget
              ? t('settings.passkeyDeleteConfirmHint', {
                  name: getPasskeyDisplayName(passkeyDeleteTarget),
                  id: summarizeCredentialId(passkeyDeleteTarget.credential_id),
                })
              : t('settings.passkeyDeleteConfirmHint', {
                  name: '',
                  id: '',
                })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={Boolean(deletingPasskeyId)}
          >
            {t('shell.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!passkeyDeleteTarget || Boolean(deletingPasskeyId)}
          >
            {deletingPasskeyId === passkeyDeleteTarget?.credential_id
              ? t('settings.passkeyDeleting')
              : t('settings.passkeyDeleteConfirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmojiAvatarDialog({
  open,
  onOpenChange,
  onSelect,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emojiData: EmojiClickData) => void;
  onClear: () => void;
}) {
  const { t, theme } = useAppPreferences();
  const emojiPickerTheme = useMemo(() => {
    if (theme === 'dark') return EmojiPickerTheme.DARK;
    if (theme === 'light') return EmojiPickerTheme.LIGHT;
    return EmojiPickerTheme.AUTO;
  }, [theme]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.profileAvatarPickerTitle')}</DialogTitle>
          <DialogDescription>{t('settings.profileAvatarPickerHint')}</DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border">
          <EmojiPicker
            onEmojiClick={onSelect}
            searchPlaceHolder={t('settings.profileAvatarPickerSearch')}
            previewConfig={{ showPreview: false }}
            skinTonesDisabled
            lazyLoadEmojis
            width="100%"
            height={360}
            theme={emojiPickerTheme}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('shell.cancel')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClear}>
            {t('settings.profileAvatarClear')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
