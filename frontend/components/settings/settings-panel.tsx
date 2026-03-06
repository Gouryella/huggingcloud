'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { CloudCog, Fingerprint, Globe2, HardDrive, KeyRound, LogIn, ShieldCheck, Smile, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { EmojiClickData } from 'emoji-picker-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { clientApiFetch } from '@/lib/api';
import type {
  DownloadMode,
  HFRepoType,
  LoginOptions,
  PasskeyCredentialInfo,
  PasskeyOptionsResponse,
  SystemAuthSettings,
  SystemDomainSettings,
  SystemHFSettings,
  SystemStorageSettings,
  UserMe,
} from '@/lib/types';

import { ClearHFTokenDialog, EmojiAvatarDialog, PasskeyDeleteDialog } from './settings-panel/dialogs';
import { DOWNLOAD_MODES, HF_REPO_TYPES, LOGIN_PERSISTENCE_TTL_HOURS_MAX, LOGIN_PERSISTENCE_TTL_HOURS_MIN, PASSWORD_MIN_LENGTH } from './settings-panel/constants';
import { clampLoginPersistenceTTLHours, formatLoginPersistenceTTLDays, isApiError, parsePositiveInteger, summarizeCredentialId, toastApiError } from './settings-panel/utils';

export function SettingsPanel({
  me,
  initialHFSettings,
  initialDomainSettings,
  initialStorageSettings,
  initialAuthSettings,
}: {
  me: UserMe;
  initialHFSettings: SystemHFSettings | null;
  initialDomainSettings: SystemDomainSettings | null;
  initialStorageSettings: SystemStorageSettings | null;
  initialAuthSettings: SystemAuthSettings | null;
}) {
  const router = useRouter();
  const { t } = useAppPreferences();
  const canManageSystemSettings = me.role === 'owner' || me.role === 'admin';

  const [hfRepoId, setHFRepoId] = useState(initialHFSettings?.hf_repo_id ?? '');
  const [hfRepoType, setHFRepoType] = useState<HFRepoType>(initialHFSettings?.hf_repo_type ?? 'dataset');
  const [hfRevision, setHFRevision] = useState(initialHFSettings?.hf_revision ?? 'main');
  const [downloadMode, setDownloadMode] = useState<DownloadMode>(initialHFSettings?.download_mode ?? 'auto');
  const [hfTokenInput, setHFTokenInput] = useState('');
  const [hfTokenMasked, setHFTokenMasked] = useState<string | null>(initialHFSettings?.hf_token_masked ?? null);
  const [hasHFToken, setHasHFToken] = useState(Boolean(initialHFSettings?.has_hf_token));
  const [savingHF, setSavingHF] = useState(false);
  const [clearHFTokenDialogOpen, setClearHFTokenDialogOpen] = useState(false);
  const [appDomain, setAppDomain] = useState(initialDomainSettings?.app_domain ?? 'http://localhost:3000');
  const [savingDomains, setSavingDomains] = useState(false);
  const [storageCapacityGB, setStorageCapacityGB] = useState(String(initialStorageSettings?.private_storage_capacity_gb ?? 100));
  const [savingStorage, setSavingStorage] = useState(false);
  const [loginPersistenceTTLHours, setLoginPersistenceTTLHours] = useState(() => {
    const initial = initialAuthSettings?.login_persistence_ttl_hours ?? 24;
    return clampLoginPersistenceTTLHours(initial);
  });
  const initialPasskeyEnabled = initialAuthSettings?.passkey_enabled ?? false;
  const [passkeyEnabledSaved, setPasskeyEnabledSaved] = useState(initialPasskeyEnabled);
  const [passkeyEnabledDraft, setPasskeyEnabledDraft] = useState(initialPasskeyEnabled);
  const [savingAuth, setSavingAuth] = useState(false);
  const [myPasskeys, setMyPasskeys] = useState<PasskeyCredentialInfo[]>([]);
  const [loadingMyPasskeys, setLoadingMyPasskeys] = useState(false);
  const [passkeyNickname, setPasskeyNickname] = useState('');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);
  const [passkeyDeleteDialogOpen, setPasskeyDeleteDialogOpen] = useState(false);
  const [passkeyDeleteTarget, setPasskeyDeleteTarget] = useState<PasskeyCredentialInfo | null>(null);

  const [profileUsername, setProfileUsername] = useState(me.username || '');
  const [profileAvatarEmoji, setProfileAvatarEmoji] = useState(me.avatar_emoji || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const roleLabel = useMemo(() => (me.role === 'owner' ? 'root' : me.role), [me.role]);
  const accountName = useMemo(() => profileUsername.trim() || me.email || me.id.slice(0, 8), [me.email, me.id, profileUsername]);
  const accountInitials = useMemo(() => {
    const parts = accountName
      .trim()
      .replace(/[_\-.]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return accountName.slice(0, 2).toUpperCase();
  }, [accountName]);
  const accountAvatar = useMemo(() => profileAvatarEmoji.trim(), [profileAvatarEmoji]);

  const effectiveDomain = appDomain.trim() || 'http://localhost:3000';
  const effectiveStorageCapacityGB = useMemo(() => {
    return parsePositiveInteger(storageCapacityGB) ?? 100;
  }, [storageCapacityGB]);
  const effectiveStorageCapacityBytes = useMemo(
    () => effectiveStorageCapacityGB * 1024 * 1024 * 1024,
    [effectiveStorageCapacityGB],
  );
  const effectiveLoginPersistenceTTLHours = useMemo(
    () => clampLoginPersistenceTTLHours(loginPersistenceTTLHours),
    [loginPersistenceTTLHours],
  );
  const effectiveLoginPersistenceTTLDays = useMemo(
    () => formatLoginPersistenceTTLDays(effectiveLoginPersistenceTTLHours),
    [effectiveLoginPersistenceTTLHours],
  );

  useEffect(() => {
    let active = true;
    if (canManageSystemSettings) return () => { active = false; };
    clientApiFetch<LoginOptions>('/api/auth/login-options')
      .then((options) => {
        if (!active) return;
        const enabled = Boolean(options.passkey_enabled);
        setPasskeyEnabledSaved(enabled);
        setPasskeyEnabledDraft(enabled);
      })
      .catch(() => {
        if (!active) return;
        setPasskeyEnabledSaved(false);
        setPasskeyEnabledDraft(false);
      });
    return () => {
      active = false;
    };
  }, [canManageSystemSettings]);

  useEffect(() => {
    let active = true;
    if (!passkeyEnabledSaved) {
      setMyPasskeys([]);
      return () => {
        active = false;
      };
    }
    setLoadingMyPasskeys(true);
    clientApiFetch<PasskeyCredentialInfo[]>('/api/me/passkeys')
      .then((items) => {
        if (!active) return;
        setMyPasskeys(items);
      })
      .catch(() => {
        if (!active) return;
        setMyPasskeys([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingMyPasskeys(false);
      });
    return () => {
      active = false;
    };
  }, [passkeyEnabledSaved]);

  async function reloadMyPasskeys() {
    if (!passkeyEnabledSaved) return;
    try {
      const items = await clientApiFetch<PasskeyCredentialInfo[]>('/api/me/passkeys');
      setMyPasskeys(items);
    } catch {
      setMyPasskeys([]);
    }
  }

  function isPasskeyAlreadyRegisteredError(err: unknown): boolean {
    if (isApiError(err)) {
      const message = err.message.toLowerCase();
      return (
        message.includes('already registered')
        || message.includes('already exists')
        || message.includes('credential already belongs')
        || message.includes('credentials already registered')
      );
    }
    if (!(err instanceof Error)) {
      return false;
    }
    const name = err.name.toLowerCase();
    const message = err.message.toLowerCase();
    if (name === 'invalidstateerror') {
      return true;
    }
    return (
      message.includes('already registered')
      || message.includes('credentials already registered')
      || message.includes('registered with the relying party')
      || message.includes('excludecredentials')
    );
  }

  async function registerMyPasskey() {
    if (!passkeyEnabledSaved) {
      toast.error(t('settings.passkeyFeatureDisabled'));
      return;
    }

    setRegisteringPasskey(true);
    try {
      const optionsResult = await clientApiFetch<PasskeyOptionsResponse>('/api/me/passkeys/register/options', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const attestation = await startRegistration({
        optionsJSON: optionsResult.options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'],
      });
      await clientApiFetch<PasskeyCredentialInfo>('/api/me/passkeys/register/verify', {
        method: 'POST',
        body: JSON.stringify({
          challenge_id: optionsResult.challenge_id,
          credential: attestation,
          nickname: passkeyNickname.trim() || null,
        }),
      });
      setPasskeyNickname('');
      await reloadMyPasskeys();
      toast.success(t('settings.passkeyRegistered'));
    } catch (err) {
      if (isPasskeyAlreadyRegisteredError(err)) {
        await reloadMyPasskeys();
        toast.info(t('settings.passkeyAlreadyRegistered'));
      } else {
        toastApiError(err, t('settings.passkeyRegisterFailed'));
      }
    } finally {
      setRegisteringPasskey(false);
    }
  }

  function getPasskeyDisplayName(passkey: PasskeyCredentialInfo): string {
    return passkey.nickname?.trim() || t('settings.passkeyAutoName', { id: summarizeCredentialId(passkey.credential_id) });
  }

  async function deleteMyPasskey(credentialId: string): Promise<boolean> {
    setDeletingPasskeyId(credentialId);
    try {
      await clientApiFetch('/api/me/passkeys/' + encodeURIComponent(credentialId), {
        method: 'DELETE',
      });
      await reloadMyPasskeys();
      toast.success(t('settings.passkeyDeleted'));
      return true;
    } catch (err) {
      toastApiError(err, t('settings.passkeyDeleteFailed'));
      return false;
    } finally {
      setDeletingPasskeyId(null);
    }
  }

  function openPasskeyDeleteDialog(passkey: PasskeyCredentialInfo) {
    if (deletingPasskeyId) return;
    setPasskeyDeleteTarget(passkey);
    setPasskeyDeleteDialogOpen(true);
  }

  async function confirmDeletePasskey() {
    if (!passkeyDeleteTarget) return;
    const deleted = await deleteMyPasskey(passkeyDeleteTarget.credential_id);
    if (!deleted) return;
    setPasskeyDeleteDialogOpen(false);
    setPasskeyDeleteTarget(null);
  }

  async function saveHFSettings(options?: { clearToken?: boolean }) {
    const nextRepoId = hfRepoId.trim();
    const nextRevision = hfRevision.trim();
    if (!nextRepoId) {
      toast.error(t('settings.hfRepoIdRequired'));
      return;
    }
    if (!nextRevision) {
      toast.error(t('settings.hfRevisionRequired'));
      return;
    }

    const clearToken = Boolean(options?.clearToken);
    const replaceToken = clearToken || hfTokenInput.trim().length > 0;
    const nextToken = clearToken ? '' : hfTokenInput.trim();

    setSavingHF(true);
    try {
      const updated = await clientApiFetch<SystemHFSettings>('/api/settings/hf', {
        method: 'PATCH',
        body: JSON.stringify({
          hf_repo_id: nextRepoId,
          hf_repo_type: hfRepoType,
          hf_revision: nextRevision,
          download_mode: downloadMode,
          hf_token: replaceToken ? nextToken : null,
          replace_hf_token: replaceToken,
        }),
      });

      setHFRepoId(updated.hf_repo_id);
      setHFRepoType(updated.hf_repo_type);
      setHFRevision(updated.hf_revision);
      setDownloadMode(updated.download_mode);
      setHasHFToken(updated.has_hf_token);
      setHFTokenMasked(updated.hf_token_masked || null);
      setHFTokenInput('');
      toast.success(clearToken ? t('settings.hfTokenCleared') : t('settings.hfSaved'));
    } catch (err) {
      toastApiError(err, t('settings.hfSaveFailed'));
    } finally {
      setSavingHF(false);
    }
  }

  async function clearHFToken() {
    setClearHFTokenDialogOpen(false);
    await saveHFSettings({ clearToken: true });
  }

  function handleEmojiSelect(emojiData: EmojiClickData) {
    setProfileAvatarEmoji(emojiData.emoji);
    setEmojiPickerOpen(false);
  }

  async function updateProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nextUsername = profileUsername.trim();
    if (!nextUsername) {
      toast.error(t('settings.profileUsernameRequired'));
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await clientApiFetch<UserMe>('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          username: nextUsername,
          avatar_emoji: profileAvatarEmoji.trim() || null,
        }),
      });
      setProfileUsername(updated.username || '');
      setProfileAvatarEmoji(updated.avatar_emoji || '');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('app:user-profile-updated', {
            detail: {
              username: updated.username || '',
              avatar_emoji: updated.avatar_emoji || '',
            },
          }),
        );
      }
      toast.success(t('settings.profileSaved'));
      router.refresh();
    } catch (err) {
      toastApiError(err, t('settings.profileSaveFailed'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function updatePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const current = currentPassword.trim();
    const next = newPassword;
    const confirm = confirmPassword;
    if (!current) {
      toast.error(t('settings.currentPasswordRequired'));
      return;
    }
    if (next.length < PASSWORD_MIN_LENGTH) {
      toast.error(t('settings.newPasswordMinLength'));
      return;
    }
    if (next !== confirm) {
      toast.error(t('settings.passwordMismatch'));
      return;
    }
    if (current === next) {
      toast.error(t('settings.passwordNoChange'));
      return;
    }

    setUpdatingPassword(true);
    try {
      await clientApiFetch('/api/me/password', {
        method: 'PATCH',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('settings.passwordUpdated'));
    } catch (err) {
      toastApiError(err, t('settings.passwordUpdateFailed'));
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function saveDomainSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextAppDomain = appDomain.trim().replace(/\/+$/, '');

    if (!nextAppDomain) {
      toast.error(t('settings.appDomainRequired'));
      return;
    }

    try {
      new URL(nextAppDomain);
    } catch {
      toast.error(t('settings.domainUrlInvalid'));
      return;
    }

    setSavingDomains(true);
    try {
      const updated = await clientApiFetch<SystemDomainSettings>('/api/settings/domains', {
        method: 'PATCH',
        body: JSON.stringify({
          app_domain: nextAppDomain,
        }),
      });
      setAppDomain(updated.app_domain);
      toast.success(t('settings.domainSaved'));
    } catch (err) {
      toastApiError(err, t('settings.domainSaveFailed'));
    } finally {
      setSavingDomains(false);
    }
  }

  async function saveStorageSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const rawCapacity = storageCapacityGB.trim();

    if (!rawCapacity) {
      toast.error(t('settings.storageCapacityRequired'));
      return;
    }

    const nextCapacityGB = parsePositiveInteger(rawCapacity);
    if (!nextCapacityGB) {
      toast.error(t('settings.storageCapacityInvalid'));
      return;
    }

    setSavingStorage(true);
    try {
      const updated = await clientApiFetch<SystemStorageSettings>('/api/settings/storage', {
        method: 'PATCH',
        body: JSON.stringify({
          private_storage_capacity_gb: nextCapacityGB,
        }),
      });
      setStorageCapacityGB(String(updated.private_storage_capacity_gb));
      toast.success(t('settings.storageSaved'));
    } catch (err) {
      toastApiError(err, t('settings.storageSaveFailed'));
    } finally {
      setSavingStorage(false);
    }
  }

  async function saveAuthSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nextHours = Math.trunc(loginPersistenceTTLHours);
    if (
      !Number.isFinite(nextHours) ||
      nextHours < LOGIN_PERSISTENCE_TTL_HOURS_MIN ||
      nextHours > LOGIN_PERSISTENCE_TTL_HOURS_MAX
    ) {
      toast.error(t('settings.loginPersistenceTTLInvalid'));
      return;
    }

    setSavingAuth(true);
    try {
      const updated = await clientApiFetch<SystemAuthSettings>('/api/settings/auth', {
        method: 'PATCH',
        body: JSON.stringify({
          login_persistence_ttl_hours: nextHours,
          passkey_enabled: passkeyEnabledDraft,
        }),
      });
      setLoginPersistenceTTLHours(updated.login_persistence_ttl_hours);
      setPasskeyEnabledSaved(updated.passkey_enabled);
      setPasskeyEnabledDraft(updated.passkey_enabled);
      toast.success(t('settings.authSaved'));
    } catch (err) {
      toastApiError(err, t('settings.authSaveFailed'));
    } finally {
      setSavingAuth(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="self-start space-y-4 xl:sticky xl:top-6">
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span
              className={
                accountAvatar
                  ? 'inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xl leading-none'
                  : 'inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold tracking-wide text-white dark:bg-zinc-100 dark:text-zinc-900'
              }
            >
              {accountAvatar || accountInitials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{accountName}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{roleLabel}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('settings.currentAccount', {
              account: accountName,
              role: roleLabel,
            })}
          </p>
        </section>

        <nav aria-label="Settings sections" className="rounded-2xl border bg-card p-2 shadow-sm">
          <a href="#settings-account" className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
            {t('settings.accountTitle')}
          </a>
          <a href="#settings-auth" className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
            {t('settings.authTitle')}
          </a>
          <a href="#settings-domain" className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
            {t('settings.domainTitle')}
          </a>
          <a href="#settings-storage" className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
            {t('settings.storageTitle')}
          </a>
          <a href="#settings-hf" className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
            {t('settings.hfTitle')}
          </a>
        </nav>
      </aside>

      <div className="space-y-6">
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
            <form className="space-y-4" onSubmit={updateProfile}>
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
                    onChange={(e) => setProfileUsername(e.target.value)}
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
                    <Button type="button" size="sm" variant="outline" onClick={() => setEmojiPickerOpen(true)} disabled={savingProfile}>
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

            <form className="space-y-4 border-t pt-5" onSubmit={updatePassword}>
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
                  onChange={(e) => setCurrentPassword(e.target.value)}
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
                    onChange={(e) => setNewPassword(e.target.value)}
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
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                        onChange={(e) => setPasskeyNickname(e.target.value)}
                        placeholder={t('settings.passkeyNicknamePlaceholder')}
                        disabled={registeringPasskey}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        onClick={() => void registerMyPasskey()}
                        disabled={registeringPasskey}
                        className="w-full md:w-auto"
                      >
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
                            <p className="truncate text-sm font-medium text-foreground">
                              {getPasskeyDisplayName(item)}
                            </p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {summarizeCredentialId(item.credential_id)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deletingPasskeyId === item.credential_id}
                            onClick={() => openPasskeyDeleteDialog(item)}
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
              <form className="space-y-4" onSubmit={saveAuthSettings}>
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
                      setLoginPersistenceTTLHours(next);
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

                <label
                  htmlFor="settings-passkey-enabled"
                  className="flex items-start gap-3 rounded-lg border bg-muted/15 px-3 py-2.5"
                >
                  <Checkbox
                    id="settings-passkey-enabled"
                    checked={passkeyEnabledDraft}
                    onCheckedChange={(checked) => setPasskeyEnabledDraft(checked === true)}
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
              <form className="space-y-4" onSubmit={saveDomainSettings}>
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
                    onChange={(e) => setAppDomain(e.target.value)}
                    placeholder="https://files.example.com"
                    disabled={savingDomains}
                    required
                  />
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t('settings.appDomain')}
                  </p>
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
              <form className="space-y-4" onSubmit={saveStorageSettings}>
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
                    onChange={(e) => setStorageCapacityGB(e.target.value)}
                    disabled={savingStorage}
                    required
                  />
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {t('settings.storageCapacityGB')}
                  </p>
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
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveHFSettings();
                }}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor="settings-hf-repo-id" className="mb-1.5 block text-sm font-medium text-foreground">
                      {t('settings.hfRepoId')}
                    </label>
                    <Input
                      id="settings-hf-repo-id"
                      name="hf_repo_id"
                      value={hfRepoId}
                      onChange={(e) => setHFRepoId(e.target.value)}
                      placeholder="org/repo"
                      disabled={savingHF}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="settings-hf-repo-type" className="mb-1.5 block text-sm font-medium text-foreground">
                      {t('settings.hfRepoType')}
                    </label>
                    <Select
                      value={hfRepoType}
                      onValueChange={(value) => setHFRepoType(value as HFRepoType)}
                      disabled={savingHF}
                    >
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
                      onChange={(e) => setHFRevision(e.target.value)}
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
                      onValueChange={(value) => setDownloadMode(value as DownloadMode)}
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
                    onChange={(e) => setHFTokenInput(e.target.value)}
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
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingHF || !hasHFToken}
                    onClick={() => setClearHFTokenDialogOpen(true)}
                  >
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
      </div>

      <ClearHFTokenDialog
        open={clearHFTokenDialogOpen}
        onOpenChange={setClearHFTokenDialogOpen}
        saving={savingHF}
        onConfirm={() => void clearHFToken()}
      />

      <PasskeyDeleteDialog
        open={passkeyDeleteDialogOpen}
        onOpenChange={setPasskeyDeleteDialogOpen}
        deletingPasskeyId={deletingPasskeyId}
        passkeyDeleteTarget={passkeyDeleteTarget}
        onConfirm={() => void confirmDeletePasskey()}
        onCancel={() => {
          setPasskeyDeleteDialogOpen(false);
          setPasskeyDeleteTarget(null);
        }}
        getPasskeyDisplayName={getPasskeyDisplayName}
      />

      <EmojiAvatarDialog
        open={emojiPickerOpen}
        onOpenChange={setEmojiPickerOpen}
        onSelect={handleEmojiSelect}
        onClear={() => {
          setProfileAvatarEmoji('');
          setEmojiPickerOpen(false);
        }}
      />
    </div>
  );
}
