import { redirect } from 'next/navigation';

import { SharesTable } from '@/components/files/shares-table';
import { PageTitle } from '@/components/page-title';
import { ApiError, serverApiFetch } from '@/lib/api';
import { getServerTranslator } from '@/lib/server-i18n';
import type { LinkRecord, UserMe } from '@/lib/types';

export default async function SharesPage() {
  const { t } = await getServerTranslator();
  try {
    const me = await serverApiFetch<UserMe>('/api/me');

    if (me.force_root_admin_setup) {
      redirect('/setup/root-admin');
    }

    const links = await serverApiFetch<LinkRecord[]>('/api/links');

    return (
      <div className="space-y-4">
        <PageTitle eyebrow={t('pages.shares.eyebrow')} title={t('pages.shares.title')} subtitle={t('pages.shares.subtitle')} />
        <SharesTable initialLinks={links} />
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }
}
