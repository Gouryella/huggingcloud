'use client';

import { useEffect, useMemo, useState } from 'react';

import { PaginationNav } from '@/components/pagination-nav';
import { PageSizeSelect } from '@/components/page-size-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size';
import { formatBytes, formatDateTime } from '@/lib/format';
import { displayRepoPath } from '@/lib/path-display';
import type { UploadSessionInfo } from '@/lib/types';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type BadgeVariant = 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive' | 'outline';
type UploadFilter = 'all' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

function isCancelledUpload(item: UploadSessionInfo): boolean {
  if (item.status !== 'failed') return false;
  const message = item.error_message?.toLowerCase() || '';
  return (
    message.includes('cancel') ||
    message.includes('abort') ||
    message.includes('interrupted') ||
    message.includes('取消')
  );
}

function uploadStatusVariant(item: UploadSessionInfo): BadgeVariant {
  if (isCancelledUpload(item)) return 'warning';
  switch (item.status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'uploading':
      return 'info';
    case 'committing':
      return 'warning';
    case 'pending':
    default:
      return 'secondary';
  }
}

export function UploadsTable({ items }: { items: UploadSessionInfo[] }) {
  const { t } = useAppPreferences();
  const [statusFilter, setStatusFilter] = useState<UploadFilter>('all');
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePersistedPageSize('hf.page_size.uploads', DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS);
  const filterCounts = useMemo(() => {
    const counts: Record<UploadFilter, number> = {
      all: items.length,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const item of items) {
      if (item.status === 'pending' || item.status === 'uploading' || item.status === 'committing') {
        counts.in_progress += 1;
      }
      if (item.status === 'completed') {
        counts.completed += 1;
      }
      if (item.status === 'failed') {
        if (isCancelledUpload(item)) counts.cancelled += 1;
        else counts.failed += 1;
      }
    }

    return counts;
  }, [items]);
  const filteredItems = useMemo(() => {
    switch (statusFilter) {
      case 'in_progress':
        return items.filter((item) => item.status === 'pending' || item.status === 'uploading' || item.status === 'committing');
      case 'completed':
        return items.filter((item) => item.status === 'completed');
      case 'failed':
        return items.filter((item) => item.status === 'failed' && !isCancelledUpload(item));
      case 'cancelled':
        return items.filter((item) => isCancelledUpload(item));
      case 'all':
      default:
        return items;
    }
  }, [items, statusFilter]);
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

  function handlePageSizeChange(nextSize: number) {
    setPageSize(nextSize);
    setPage(1);
  }

  function handleFilterChange(nextFilter: UploadFilter) {
    setStatusFilter(nextFilter);
    setPage(1);
  }

  function statusText(item: UploadSessionInfo) {
    if (isCancelledUpload(item)) return t('uploads.statusCancelled');
    switch (item.status) {
      case 'pending':
        return t('uploads.statusPending');
      case 'uploading':
        return t('uploads.statusUploading');
      case 'committing':
        return t('uploads.statusCommitting');
      case 'completed':
        return t('uploads.statusCompleted');
      case 'failed':
      default:
        return t('uploads.statusFailed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 md:p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => handleFilterChange('all')}>
            {t('uploads.filterAll')} ({filterCounts.all})
          </Button>
          <Button size="sm" variant={statusFilter === 'in_progress' ? 'default' : 'outline'} onClick={() => handleFilterChange('in_progress')}>
            {t('uploads.filterInProgress')} ({filterCounts.in_progress})
          </Button>
          <Button size="sm" variant={statusFilter === 'completed' ? 'default' : 'outline'} onClick={() => handleFilterChange('completed')}>
            {t('uploads.filterCompleted')} ({filterCounts.completed})
          </Button>
          <Button size="sm" variant={statusFilter === 'failed' ? 'default' : 'outline'} onClick={() => handleFilterChange('failed')}>
            {t('uploads.filterFailed')} ({filterCounts.failed})
          </Button>
          <Button size="sm" variant={statusFilter === 'cancelled' ? 'default' : 'outline'} onClick={() => handleFilterChange('cancelled')}>
            {t('uploads.filterCancelled')} ({filterCounts.cancelled})
          </Button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t('uploads.noFilteredSessions')}</div>
      ) : (
        <>
          <TooltipProvider delayDuration={120}>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('uploads.path')}</TableHead>
                    <TableHead>{t('uploads.status')}</TableHead>
                    <TableHead>{t('uploads.size')}</TableHead>
                    <TableHead>{t('uploads.chunk')}</TableHead>
                    <TableHead>{t('uploads.received')}</TableHead>
                    <TableHead>{t('uploads.updated')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((upload) => {
                    const displayPath = displayRepoPath(upload.path);
                    return (
                      <TableRow key={upload.id}>
                        <TableCell className="max-w-[46vw] font-mono text-xs md:max-w-[560px] md:text-sm">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block cursor-default truncate">{displayPath}</span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[min(85vw,70rem)] break-all border border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              {displayPath}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant={uploadStatusVariant(upload)}>{statusText(upload)}</Badge>
                        </TableCell>
                        <TableCell>{formatBytes(upload.size)}</TableCell>
                        <TableCell>{formatBytes(upload.chunk_size)}</TableCell>
                        <TableCell>{upload.received_chunks.length}</TableCell>
                        <TableCell>{formatDateTime(upload.updated_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <PageSizeSelect value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={handlePageSizeChange} />
            <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} canPrev={page > 1} canNext={page < totalPages} />
          </div>
        </>
      )}
    </div>
  );
}
