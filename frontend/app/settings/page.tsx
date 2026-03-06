import { redirect } from 'next/navigation';

import { SettingsPanel } from '@/components/settings/settings-panel';
import { PageTitle } from '@/components/page-title';
import { ApiError, serverApiFetch } from '@/lib/api';
import { getServerTranslator } from '@/lib/server-i18n';
import type { SystemAuthSettings, SystemDomainSettings, SystemHFSettings, SystemStorageSettings, UserMe } from '@/lib/types';

export default async function SettingsPage() {
  const { t } = await getServerTranslator();
  try {
    const me = await serverApiFetch<UserMe>('/api/me');

    if (me.force_root_admin_setup) {
      redirect('/setup/root-admin');
    }

    let hfSettings: SystemHFSettings | null = null;
    let domainSettings: SystemDomainSettings | null = null;
    let storageSettings: SystemStorageSettings | null = null;
    let authSettings: SystemAuthSettings | null = null;
    if (me.role === 'owner' || me.role === 'admin') {
      [hfSettings, domainSettings, storageSettings, authSettings] = await Promise.all([
        serverApiFetch<SystemHFSettings>('/api/settings/hf'),
        serverApiFetch<SystemDomainSettings>('/api/settings/domains'),
        serverApiFetch<SystemStorageSettings>('/api/settings/storage'),
        serverApiFetch<SystemAuthSettings>('/api/settings/auth'),
      ]);
    }

    return (
      <div className="space-y-6">
        <PageTitle
          eyebrow={t('pages.settings.eyebrow')}
          title={t('pages.settings.title')}
          subtitle={t('pages.settings.subtitle')}
        />
        <SettingsPanel
          me={me}
          initialHFSettings={hfSettings}
          initialDomainSettings={domainSettings}
          initialStorageSettings={storageSettings}
          initialAuthSettings={authSettings}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }
}
