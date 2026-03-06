'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PaginationNav } from '@/components/pagination-nav';
import { PageSizeSelect } from '@/components/page-size-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size';
import { ApiError, clientApiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AuditEntry, AuditListResponse } from '@/lib/types';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type BadgeVariant = 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive' | 'outline';
type AuditFilter = 'all' | string;

function actionGroup(action: string): string {
  const normalized = action.trim().toLowerCase();
  if (!normalized) return 'other';
  const group = normalized.split('.')[0];
  return group || 'other';
}

function actionGroupLabel(group: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (group) {
    case 'auth':
      return t('audit.filterAuth');
    case 'upload':
      return t('audit.filterUpload');
    case 'download':
      return t('audit.filterDownload');
    case 'file':
      return t('audit.filterFile');
    case 'link':
      return t('audit.filterLink');
    case 'setup':
      return t('audit.filterSetup');
    case 'settings':
      return t('audit.filterSettings');
    case 'other':
      return t('audit.filterOther');
    default:
      return group;
  }
}

function auditActionVariant(action: string): BadgeVariant {
  if (action.includes('revoke') || action.includes('delete')) return 'destructive';
  if (action.startsWith('download')) return 'info';
  if (action.startsWith('upload')) return 'warning';
  if (action.startsWith('auth') || action.includes('login')) return 'success';
  if (action.startsWith('link')) return 'info';
  return 'secondary';
}

function auditActionLabel(action: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (action) {
    case 'auth.login':
      return t('audit.actionAuthLogin');
    case 'auth.register':
      return t('audit.actionAuthRegister');
    case 'auth.profile.update':
      return t('audit.actionAuthProfileUpdate');
    case 'auth.password.update':
      return t('audit.actionAuthPasswordUpdate');
    case 'auth.passkey.register':
      return t('audit.actionAuthPasskeyRegister');
    case 'auth.passkey.delete':
      return t('audit.actionAuthPasskeyDelete');
    case 'upload.init':
      return t('audit.actionUploadInit');
    case 'upload.complete':
      return t('audit.actionUploadComplete');
    case 'upload.cancel':
      return t('audit.actionUploadCancel');
    case 'file.delete':
      return t('audit.actionFileDelete');
    case 'file.move':
      return t('audit.actionFileMove');
    case 'link.create':
      return t('audit.actionLinkCreate');
    case 'link.revoke':
      return t('audit.actionLinkRevoke');
    case 'download.proxy':
      return t('audit.actionDownloadProxy');
    case 'download.redirect':
      return t('audit.actionDownloadRedirect');
    case 'setup.root_admin.create':
      return t('audit.actionSetupRootAdminCreate');
    case 'settings.hf.update':
      return t('audit.actionSettingsHFUpdate');
    case 'settings.domains.update':
      return t('audit.actionSettingsDomainsUpdate');
    case 'settings.storage.update':
      return t('audit.actionSettingsStorageUpdate');
    default:
      return action;
  }
}

export function AuditTable({
  initialItems,
  initialNextCursor = null,
  pageLimit = 500,
}: {
  initialItems: AuditEntry[];
  initialNextCursor?: string | null;
  pageLimit?: number;
}) {
  const { t } = useAppPreferences();
  const [items, setItems] = useState<AuditEntry[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionFilter, setActionFilter] = useState<AuditFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const { pageSize, setPageSize } = usePersistedPageSize('hf.page_size.audit', DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS);
  const actionGroups = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of items) {
      const group = actionGroup(item.action);
      counter.set(group, (counter.get(group) || 0) + 1);
    }

    const priority = ['auth', 'upload', 'download', 'file', 'link', 'setup', 'settings', 'other'];
    return [...counter.entries()].sort(([left], [right]) => {
      const leftIdx = priority.indexOf(left);
      const rightIdx = priority.indexOf(right);
      const leftScore = leftIdx === -1 ? priority.length : leftIdx;
      const rightScore = rightIdx === -1 ? priority.length : rightIdx;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return left.localeCompare(right);
    });
  }, [items]);
  const filteredItems = useMemo(() => {
    if (actionFilter === 'all') return items;
    return items.filter((item) => actionGroup(item.action) === actionFilter);
  }, [items, actionFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (actionFilter === 'all') return;
    if (actionGroups.some(([group]) => group === actionFilter)) return;
    setActionFilter('all');
  }, [actionFilter, actionGroups]);

  useEffect(() => {
    setItems(initialItems);
    setNextCursor(initialNextCursor);
    setPage(1);
  }, [initialItems, initialNextCursor]);

  function handlePageSizeChange(nextSize: number) {
    setPageSize(nextSize);
    setPage(1);
  }

  function handleFilterChange(nextFilter: AuditFilter) {
    setActionFilter(nextFilter);
    setPage(1);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageLimit),
        cursor: nextCursor,
      });
      const resp = await clientApiFetch<AuditListResponse>(`/api/audit?${params.toString()}`);
      setItems((prev) => [...prev, ...resp.items]);
      setNextCursor(resp.next_cursor ?? null);
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(t('audit.loadMoreFailed'));
    } finally {
      setLoadingMore(false);
    }
  }

  const selectedMetadata = selectedEntry?.metadata_json ? JSON.stringify(selectedEntry.metadata_json, null, 2) : '';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 md:p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={actionFilter === 'all' ? 'default' : 'outline'} onClick={() => handleFilterChange('all')}>
            {t('audit.filterAll')} ({items.length})
          </Button>
          {actionGroups.map(([group, count]) => (
            <Button
              key={group}
              size="sm"
              variant={actionFilter === group ? 'default' : 'outline'}
              onClick={() => handleFilterChange(group)}
            >
              {actionGroupLabel(group, t)} ({count})
            </Button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('audit.noFilteredEvents')}</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('audit.action')}</TableHead>
                  <TableHead>{t('audit.resource')}</TableHead>
                  <TableHead>{t('audit.email')}</TableHead>
                  <TableHead>{t('audit.ip')}</TableHead>
                  <TableHead>{t('audit.time')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedEntry(entry);
                    }}
                  >
                    <TableCell>
                      <Badge variant={auditActionVariant(entry.action)}>{auditActionLabel(entry.action, t)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs md:text-sm">{entry.resource}</TableCell>
                    <TableCell className="text-xs md:text-sm">{entry.user_email || '-'}</TableCell>
                    <TableCell>{entry.ip || '-'}</TableCell>
                    <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <PageSizeSelect value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={handlePageSizeChange} />
            <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} canPrev={page > 1} canNext={page < totalPages} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('audit.loadedCount', { count: items.length })}</span>
            {nextCursor ? (
              <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? t('audit.loadingMore') : t('audit.loadMore')}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <Dialog
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('audit.detailsTitle')}</DialogTitle>
            <DialogDescription>{t('audit.detailsHint')}</DialogDescription>
          </DialogHeader>
          {selectedEntry ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">{t('audit.action')}</p>
                  <div className="mt-1">
                    <Badge variant={auditActionVariant(selectedEntry.action)}>{auditActionLabel(selectedEntry.action, t)}</Badge>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">{t('audit.time')}</p>
                  <p className="mt-1">{formatDateTime(selectedEntry.created_at)}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">{t('audit.email')}</p>
                  <p className="mt-1 break-all">{selectedEntry.user_email || '-'}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">{t('audit.ip')}</p>
                  <p className="mt-1 break-all">{selectedEntry.ip || '-'}</p>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/20 p-2">
                <p className="text-xs text-muted-foreground">{t('audit.resource')}</p>
                <p className="mt-1 break-all font-mono text-xs md:text-sm">{selectedEntry.resource}</p>
              </div>

              <div className="rounded-md border border-border bg-muted/20 p-2">
                <p className="text-xs text-muted-foreground">{t('audit.recordId')}</p>
                <p className="mt-1 break-all font-mono text-xs md:text-sm">{selectedEntry.id}</p>
              </div>

              <div className="rounded-md border border-border bg-muted/20 p-2">
                <p className="text-xs text-muted-foreground">{t('audit.metadata')}</p>
                {selectedMetadata ? (
                  <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 font-mono text-xs leading-5">
                    {selectedMetadata}
                  </pre>
                ) : (
                  <p className="mt-1 text-muted-foreground">{t('audit.noMetadata')}</p>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedEntry(null)}>
              {t('shell.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
