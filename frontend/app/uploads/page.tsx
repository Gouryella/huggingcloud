import { redirect } from 'next/navigation';

import { UploadsTable } from '@/components/files/uploads-table';
import { PageTitle } from '@/components/page-title';
import { ApiError, serverApiFetch } from '@/lib/api';
import { getServerTranslator } from '@/lib/server-i18n';
import type { UploadSessionInfo, UserMe } from '@/lib/types';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default async function UploadsPage() {
  const { t } = await getServerTranslator();
  try {
    const me = await serverApiFetch<UserMe>('/api/me');

    if (me.force_root_admin_setup) {
      redirect('/setup/root-admin');
    }

    const uploads = await serverApiFetch<UploadSessionInfo[]>('/api/uploads');
    const completed = uploads.filter((item) => item.status === 'completed').length;
    const failed = uploads.filter((item) => item.status === 'failed').length;

    return (
      <div className="space-y-4">
        <PageTitle eyebrow={t('pages.uploads.eyebrow')} title={t('pages.uploads.title')} subtitle={t('pages.uploads.subtitle')} />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label={t('uploads.totalSessions')} value={String(uploads.length)} />
          <StatCard label={t('uploads.completed')} value={String(completed)} />
          <StatCard label={t('uploads.failed')} value={String(failed)} />
        </div>

        {uploads.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('uploads.noSessions')}</div>
        ) : (
          <UploadsTable items={uploads} />
        )}
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    throw err;
  }
}
