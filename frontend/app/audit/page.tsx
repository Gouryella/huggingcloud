import { redirect } from 'next/navigation';

import { AuditTable } from '@/components/files/audit-table';
import { PageTitle } from '@/components/page-title';
import { ApiError, serverApiFetch } from '@/lib/api';
import { getServerTranslator } from '@/lib/server-i18n';
import type { AuditListResponse, UserMe } from '@/lib/types';

const AUDIT_PAGE_LIMIT = 500;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default async function AuditPage() {
  const { t } = await getServerTranslator();
  try {
    const me = await serverApiFetch<UserMe>('/api/me');

    if (me.force_root_admin_setup) {
      redirect('/setup/root-admin');
    }

    const initialAudit = await serverApiFetch<AuditListResponse>(`/api/audit?limit=${AUDIT_PAGE_LIMIT}`);
    const uniqueActions = new Set(initialAudit.items.map((item) => item.action)).size;
    const downloadEvents = initialAudit.items.filter((item) => item.action.startsWith('download')).length;
    const eventsLabel = initialAudit.next_cursor ? `${initialAudit.items.length}+` : String(initialAudit.items.length);

    return (
      <div className="space-y-4">
        <PageTitle eyebrow={t('pages.audit.eyebrow')} title={t('pages.audit.title')} subtitle={t('pages.audit.subtitle')} />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label={t('audit.events')} value={eventsLabel} />
          <StatCard label={t('audit.actionTypes')} value={String(uniqueActions)} />
          <StatCard label={t('audit.downloads')} value={String(downloadEvents)} />
        </div>

        {initialAudit.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('audit.noEvents')}</div>
        ) : (
          <AuditTable
            initialItems={initialAudit.items}
            initialNextCursor={initialAudit.next_cursor ?? null}
            pageLimit={AUDIT_PAGE_LIMIT}
          />
        )}
      </div>
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login');
    }
    if (err instanceof ApiError && err.status === 403) {
      return (
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold text-foreground">{t('pages.audit.accessDeniedTitle')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('pages.audit.accessDeniedHint')}</p>
        </div>
      );
    }
    throw err;
  }
}
