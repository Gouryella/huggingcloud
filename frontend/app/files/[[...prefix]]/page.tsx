import Link from 'next/link';
import { redirect } from 'next/navigation';

import { FileBrowser } from '@/components/files/file-browser';
import { PageTitle } from '@/components/page-title';
import { ApiError, serverApiFetch } from '@/lib/api';
import { getServerTranslator } from '@/lib/server-i18n';
import type { FileListResponse, UserMe } from '@/lib/types';

export default async function FilesPage({
  params,
  searchParams
}: {
  params: Promise<{ prefix?: string[] }>;
  searchParams: Promise<{ q?: string; cursor?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  const prefix = resolvedParams.prefix?.join('/') || '';
  const { t } = await getServerTranslator();

  try {
    const me = await serverApiFetch<UserMe>('/api/me');

    if (me.force_root_admin_setup) {
      redirect('/setup/root-admin');
    }

    const files = await serverApiFetch<FileListResponse>(
      `/api/files?${new URLSearchParams({
        ...(prefix ? { prefix } : {}),
        ...(resolvedSearch.q ? { q: resolvedSearch.q } : {}),
        ...(resolvedSearch.cursor ? { cursor: resolvedSearch.cursor } : {}),
        limit: '500',
      }).toString()}`
    );

    return (
      <div>
        <PageTitle
          eyebrow={t('pages.files.eyebrow')}
          title={t('pages.files.title')}
          subtitle={t('pages.files.subtitle')}
        />
        {files.hf_repo_configured === false ? (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <p className="text-sm font-semibold">{t('pages.files.hfRepoNotConfiguredTitle')}</p>
            <p className="mt-1 text-sm">
              {me.role === 'owner' || me.role === 'admin'
                ? t('pages.files.hfRepoNotConfiguredHintOwner')
                : t('pages.files.hfRepoNotConfiguredHintMember')}
            </p>
            {me.role === 'owner' || me.role === 'admin' ? (
              <Link
                href="/settings"
                className="mt-3 inline-flex rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
              >
                {t('pages.files.openSettings')}
              </Link>
            ) : null}
          </div>
        ) : null}
        <FileBrowser
          initialItems={files.items}
          initialCursor={files.next_cursor}
          initialPrefix={prefix}
          initialQuery={resolvedSearch.q || ''}
          initialTotalFiles={files.total_files}
          initialTotalSizeBytes={files.total_size_bytes}
          initialStorageCapacityBytes={files.storage_capacity_bytes ?? null}
          initialStorageRemainingBytes={files.storage_remaining_bytes ?? null}
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
