'use client';

import type { FormEventHandler } from 'react';
import { Fingerprint, ShieldCheck, Smile, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PasskeyCredentialInfo } from '@/lib/types';

import { summarizeCredentialId } from '../utils';

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function AccountSection({
  t,
  canManageSystemSettings,
  profileUsername,
  profileAvatarEmoji,
  savingProfile,
  onProfileUsernameChange,
  onOpenEmojiPicker,
  onSubmitProfile,
  currentPassword,
  newPassword,
  confirmPassword,
  updatingPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmitPassword,
  passkeyEnabledSaved,
  passkeyNickname,
  registeringPasskey,
  loadingMyPasskeys,
  myPasskeys,
  deletingPasskeyId,
  onPasskeyNicknameChange,
  onRegisterPasskey,
  onOpenPasskeyDeleteDialog,
  getPasskeyDisplayName,
}: {
  t: TranslateFn;
  canManageSystemSettings: boolean;
  profileUsername: string;
  profileAvatarEmoji: string;
  savingProfile: boolean;
  onProfileUsernameChange: (value: string) => void;
  onOpenEmojiPicker: () => void;
  onSubmitProfile: FormEventHandler<HTMLFormElement>;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  updatingPassword: boolean;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmitPassword: FormEventHandler<HTMLFormElement>;
  passkeyEnabledSaved: boolean;
  passkeyNickname: string;
  registeringPasskey: boolean;
  loadingMyPasskeys: boolean;
  myPasskeys: PasskeyCredentialInfo[];
  deletingPasskeyId: string | null;
  onPasskeyNicknameChange: (value: string) => void;
  onRegisterPasskey: () => void;
  onOpenPasskeyDeleteDialog: (passkey: PasskeyCredentialInfo) => void;
  getPasskeyDisplayName: (passkey: PasskeyCredentialInfo) => string;
}) {
  return (
    <section id="settings-account" className="scroll-mt-24 rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('settings.accountTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.accountSubtitle')}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
          <ShieldCheck className="h-4 w-4 text-foreground/80" />
        </span>
      </div>

      <div className="space-y-5 px-5 pb-5 pt-4">
        <form className="space-y-4" onSubmit={onSubmitProfile}>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('settings.profileTitle')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('settings.profileSubtitle')}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="settings-profile-username" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.profileUsername')}
              </label>
              <Input
                id="settings-profile-username"
                name="username"
                value={profileUsername}
                onChange={(e) => onProfileUsernameChange(e.target.value)}
                placeholder={t('shell.usernamePlaceholder')}
                disabled={savingProfile}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.profileAvatar')}
              </label>
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xl leading-none">
                  {profileAvatarEmoji.trim() || '🙂'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {profileAvatarEmoji.trim() ? t('settings.profileAvatarSelected') : t('settings.profileAvatarNotSet')}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={onOpenEmojiPicker} disabled={savingProfile}>
                  <Smile className="mr-1.5 h-3.5 w-3.5" />
                  {t('settings.profileAvatarChoose')}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" className="w-full sm:w-auto" disabled={savingProfile}>
              {savingProfile ? t('settings.profileSaving') : t('settings.profileSaveButton')}
            </Button>
          </div>
        </form>

        <form className="space-y-4 border-t pt-5" onSubmit={onSubmitPassword}>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('settings.passwordTitle')}</h3>
          </div>

          <div>
            <label htmlFor="settings-current-password" className="mb-1.5 block text-sm font-medium text-foreground">
              {t('settings.currentPassword')}
            </label>
            <Input
              id="settings-current-password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => onCurrentPasswordChange(e.target.value)}
              disabled={updatingPassword}
              required
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="settings-new-password" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.newPassword')}
              </label>
              <Input
                id="settings-new-password"
                name="new_password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => onNewPasswordChange(e.target.value)}
                disabled={updatingPassword}
                required
              />
            </div>

            <div>
              <label htmlFor="settings-confirm-password" className="mb-1.5 block text-sm font-medium text-foreground">
                {t('settings.confirmPassword')}
              </label>
              <Input
                id="settings-confirm-password"
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => onConfirmPasswordChange(e.target.value)}
                disabled={updatingPassword}
                required
              />
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" className="w-full sm:w-auto" disabled={updatingPassword}>
              {updatingPassword ? t('settings.passwordUpdating') : t('settings.passwordUpdateButton')}
            </Button>
          </div>
        </form>

        <div className="space-y-4 border-t pt-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('settings.passkeyTitle')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('settings.passkeySubtitle')}</p>
          </div>

          {!passkeyEnabledSaved ? (
            <div className="space-y-3 rounded-lg border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              <p>{canManageSystemSettings ? t('settings.passkeyDisabledHintAdmin') : t('settings.passkeyDisabledHintMember')}</p>
              {canManageSystemSettings ? (
                <a
                  href="#settings-auth"
                  className="inline-flex w-fit items-center rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/30"
                >
                  {t('settings.passkeyGoEnable')}
                </a>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <label htmlFor="settings-passkey-nickname" className="mb-1.5 block text-sm font-medium text-foreground">
                    {t('settings.passkeyNickname')}
                  </label>
                  <Input
                    id="settings-passkey-nickname"
                    value={passkeyNickname}
                    onChange={(e) => onPasskeyNicknameChange(e.target.value)}
                    placeholder={t('settings.passkeyNicknamePlaceholder')}
                    disabled={registeringPasskey}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" onClick={onRegisterPasskey} disabled={registeringPasskey} className="w-full md:w-auto">
                    <Fingerprint className="mr-1.5 h-4 w-4" />
                    {registeringPasskey ? t('settings.passkeyRegistering') : t('settings.passkeyRegisterButton')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {loadingMyPasskeys ? (
                  <p className="text-sm text-muted-foreground">{t('settings.passkeyLoading')}</p>
                ) : myPasskeys.length === 0 ? (
                  <p className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{t('settings.passkeyEmpty')}</p>
                ) : (
                  myPasskeys.map((item) => (
                    <div key={item.credential_id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/10 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{getPasskeyDisplayName(item)}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{summarizeCredentialId(item.credential_id)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deletingPasskeyId === item.credential_id}
                        onClick={() => onOpenPasskeyDeleteDialog(item)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {deletingPasskeyId === item.credential_id ? t('settings.passkeyDeleting') : t('settings.passkeyDeleteButton')}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
