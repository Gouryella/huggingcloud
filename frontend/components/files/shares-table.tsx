'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Copy, Link2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';

import { PaginationNav } from '@/components/pagination-nav';
import { PageSizeSelect } from '@/components/page-size-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size';
import { ApiError, clientApiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { displayRepoPath } from '@/lib/path-display';
import type { LinkRecord } from '@/lib/types';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type ShareFilter = 'all' | 'active' | 'revoked';

function isNeverExpires(expiresAt: string) {
  return expiresAt.startsWith('9999-12-31');
}

function buildFallbackShortUrl(link: LinkRecord) {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  const origin =
    base ||
    (typeof window !== 'undefined' ? window.location.origin.replace(/\/+$/, '') : '');
  const filename = encodeURIComponent(link.path.split('/').pop() || 'file');
  return `${origin}/s/${link.id}/${filename}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function SharesTable({ initialLinks }: { initialLinks: LinkRecord[] }) {
  const { t } = useAppPreferences();
  const reduceMotion = useReducedMotion();
  const [links, setLinks] = useState<LinkRecord[]>(initialLinks);
  const [statusFilter, setStatusFilter] = useState<ShareFilter>('all');
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(() => new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const shiftSelectionRef = useRef(false);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePersistedPageSize('hf.page_size.shares', DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS);

  const activeCount = useMemo(() => links.filter((x) => !x.revoked_at).length, [links]);
  const revokedCount = useMemo(() => links.filter((x) => !!x.revoked_at).length, [links]);
  const filteredLinks = useMemo(() => {
    if (statusFilter === 'active') return links.filter((item) => !item.revoked_at);
    if (statusFilter === 'revoked') return links.filter((item) => !!item.revoked_at);
    return links;
  }, [links, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / pageSize));
  const pageLinks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLinks.slice(start, start + pageSize);
  }, [filteredLinks, page, pageSize]);
  const selectableLinkIds = useMemo(() => filteredLinks.filter((link) => !link.revoked_at).map((link) => link.id), [filteredLinks]);
  const currentPageActiveLinkIds = useMemo(
    () => pageLinks.filter((link) => !link.revoked_at).map((link) => link.id),
    [pageLinks],
  );
  const selectedActiveLinks = useMemo(
    () => links.filter((link) => selectedLinkIds.has(link.id) && !link.revoked_at),
    [links, selectedLinkIds],
  );
  const selectedCount = selectedActiveLinks.length;
  const selectedCurrentPageCount = useMemo(
    () => currentPageActiveLinkIds.filter((id) => selectedLinkIds.has(id)).length,
    [currentPageActiveLinkIds, selectedLinkIds],
  );
  const allCurrentPageSelected =
    currentPageActiveLinkIds.length > 0 && selectedCurrentPageCount === currentPageActiveLinkIds.length;
  const currentPageCheckState: boolean | 'indeterminate' =
    allCurrentPageSelected ? true : selectedCurrentPageCount > 0 ? 'indeterminate' : false;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const activeIds = new Set(links.filter((item) => !item.revoked_at).map((item) => item.id));
    setSelectedLinkIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (activeIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setSelectionAnchorId((prev) => (prev && activeIds.has(prev) ? prev : null));
  }, [links]);

  async function revoke(linkId: string, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    try {
      await clientApiFetch(`/api/links/${linkId}/revoke`, { method: 'POST' });
      const revokedAt = new Date().toISOString();
      setLinks((prev) => prev.map((link) => (link.id === linkId ? { ...link, revoked_at: revokedAt } : link)));
      setSelectedLinkIds((prev) => {
        if (!prev.has(linkId)) return prev;
        const next = new Set(prev);
        next.delete(linkId);
        return next;
      });
      setSelectionAnchorId((prev) => (prev === linkId ? null : prev));
      if (!silent) {
        toast.success(t('shares.linkRevoked'));
      }
      return true;
    } catch (err) {
      if (!silent) {
        if (err instanceof ApiError) toast.error(err.message);
        else toast.error(t('shares.revokeFailed'));
      }
      return false;
    }
  }

  async function revokeSelected(linkIds: string[]) {
    if (linkIds.length === 0) return false;

    let revokedTotal = 0;
    for (const id of linkIds) {
      const revoked = await revoke(id, { silent: true });
      if (revoked) revokedTotal += 1;
    }

    const failedTotal = linkIds.length - revokedTotal;
    if (revokedTotal > 0) {
      toast.success(t('shares.batchRevokeSuccess', { count: revokedTotal }));
    }
    if (failedTotal > 0) {
      toast.error(t('shares.batchRevokeFailed', { count: failedTotal }));
    }
    return failedTotal === 0;
  }

  async function copyLink(link: LinkRecord) {
    if (link.revoked_at) {
      toast.error(t('shares.copyRevoked'));
      return;
    }

    try {
      await navigator.clipboard.writeText(link.short_url || buildFallbackShortUrl(link));
      toast.success(t('shares.linkCopied'));
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error(t('shares.copyFailed'));
    }
  }

  function handlePageSizeChange(nextSize: number) {
    setPageSize(nextSize);
    setPage(1);
  }

  function toggleCurrentPageSelection(checked: boolean) {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      for (const id of currentPageActiveLinkIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    if (currentPageActiveLinkIds.length > 0) {
      setSelectionAnchorId(currentPageActiveLinkIds[0]);
    }
  }

  function clearSelection() {
    setSelectedLinkIds(new Set());
    setSelectionAnchorId(null);
  }

  function updateLinkSelection(linkId: string, checked: boolean, shiftKey: boolean) {
    setSelectedLinkIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && selectionAnchorId) {
        const startIndex = selectableLinkIds.indexOf(selectionAnchorId);
        const endIndex = selectableLinkIds.indexOf(linkId);
        if (startIndex >= 0 && endIndex >= 0) {
          const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          for (let i = from; i <= to; i += 1) {
            const rangeLinkId = selectableLinkIds[i];
            if (checked) next.add(rangeLinkId);
            else next.delete(rangeLinkId);
          }
          return next;
        }
      }

      if (checked) next.add(linkId);
      else next.delete(linkId);
      return next;
    });
    setSelectionAnchorId(linkId);
  }

  function handleFilterChange(nextFilter: ShareFilter) {
    setStatusFilter(nextFilter);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t('shares.total')} value={String(links.length)} />
        <StatCard label={t('shares.active')} value={String(activeCount)} />
        <StatCard label={t('shares.revoked')} value={String(revokedCount)} />
      </div>

      {links.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border">
            <Link2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-4 text-base font-medium text-foreground">{t('shares.noLinks')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('shares.noLinksHint')}</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-3 md:p-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => handleFilterChange('all')}>
                {t('shares.filterAll')} ({links.length})
              </Button>
              <Button size="sm" variant={statusFilter === 'active' ? 'default' : 'outline'} onClick={() => handleFilterChange('active')}>
                {t('shares.filterActive')} ({activeCount})
              </Button>
              <Button size="sm" variant={statusFilter === 'revoked' ? 'default' : 'outline'} onClick={() => handleFilterChange('revoked')}>
                {t('shares.filterRevoked')} ({revokedCount})
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
              <AnimatePresence initial={false}>
                {selectedCount > 0 ? (
                  <motion.span
                    key="shares-selected-count"
                    initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="text-sm text-muted-foreground"
                  >
                    {t('shares.selectedCount', { count: selectedCount })}
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPageActiveLinkIds.length === 0 || allCurrentPageSelected}
                onClick={() => toggleCurrentPageSelection(true)}
              >
                {t('shares.selectPage')}
              </Button>
              <Button size="sm" variant="outline" disabled={selectedCount === 0} onClick={clearSelection}>
                {t('shares.clearSelection')}
              </Button>
              <AnimatePresence initial={false}>
                {selectedCount > 0 ? (
                  <motion.div
                    key="shares-batch-revoke"
                    initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <BatchRevokeDialog selectedLinks={selectedActiveLinks} onRevoke={revokeSelected} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {filteredLinks.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border">
                <Link2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-4 text-base font-medium text-foreground">{t('shares.noFilteredLinks')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('shares.noLinksHint')}</p>
            </div>
          ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      className="align-middle"
                      checked={currentPageCheckState}
                      disabled={currentPageActiveLinkIds.length === 0}
                      onCheckedChange={(checked) => toggleCurrentPageSelection(checked === true)}
                      aria-label={t('shares.selectPage')}
                    />
                  </TableHead>
                  <TableHead>{t('files.path')}</TableHead>
                  <TableHead>{t('shares.status')}</TableHead>
                  <TableHead>{t('shares.downloads')}</TableHead>
                  <TableHead>{t('shares.expires')}</TableHead>
                  <TableHead>{t('shares.created')}</TableHead>
                  <TableHead className="text-right">{t('shares.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageLinks.map((link) => {
                  const revoked = !!link.revoked_at;
                  return (
                    <TableRow key={link.id}>
                      <TableCell className="w-10">
                        <Checkbox
                          className="align-middle"
                          checked={selectedLinkIds.has(link.id)}
                          disabled={revoked}
                          onPointerDown={(e) => {
                            shiftSelectionRef.current = e.shiftKey;
                          }}
                          onClick={(e) => {
                            shiftSelectionRef.current = e.shiftKey;
                          }}
                          onCheckedChange={(checked) => {
                            updateLinkSelection(link.id, checked === true, shiftSelectionRef.current);
                            shiftSelectionRef.current = false;
                          }}
                          aria-label={displayRepoPath(link.path)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs md:text-sm">{displayRepoPath(link.path)}</TableCell>
                      <TableCell>
                        <Badge variant={revoked ? 'destructive' : 'success'}>
                          {revoked ? t('shares.statusRevoked') : t('shares.statusActive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {link.download_count}
                        {link.max_downloads ? ` / ${link.max_downloads}` : ''}
                      </TableCell>
                      <TableCell>{isNeverExpires(link.expires_at) ? t('files.never') : formatDateTime(link.expires_at)}</TableCell>
                      <TableCell>{formatDateTime(link.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="outline" disabled={revoked} onClick={() => copyLink(link)}>
                            <Copy className="mr-1 h-4 w-4" />
                            {t('shares.copy')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={revoked}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/40 disabled:text-muted-foreground"
                            onClick={() => {
                              void revoke(link.id);
                            }}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <PageSizeSelect value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={handlePageSizeChange} />
            <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} canPrev={page > 1} canNext={page < totalPages} />
          </div>
        </>
      )}
    </div>
  );
}

function BatchRevokeDialog({
  selectedLinks,
  onRevoke,
}: {
  selectedLinks: LinkRecord[];
  onRevoke: (linkIds: string[]) => Promise<boolean>;
}) {
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedCount = selectedLinks.length;
  const previewPaths = selectedLinks.slice(0, 5).map((link) => displayRepoPath(link.path));
  const remainingCount = Math.max(0, selectedCount - previewPaths.length);

  async function onSubmit() {
    if (selectedCount === 0) return;
    setBusy(true);
    try {
      const revoked = await onRevoke(selectedLinks.map((link) => link.id));
      if (revoked) {
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" disabled={selectedCount === 0}>
          <Ban className="h-4 w-4" />
          {t('shares.revokeSelected', { count: selectedCount })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shares.batchRevokeTitle')}</DialogTitle>
          <DialogDescription>{t('shares.batchRevokeConfirm', { count: selectedCount })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('shares.batchRevokeHint')}</p>
          {previewPaths.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-border bg-muted/20 p-2 font-mono text-xs">
              {previewPaths.map((path) => (
                <li key={path} className="truncate">
                  {path}
                </li>
              ))}
              {remainingCount > 0 ? <li className="text-muted-foreground">+{remainingCount}</li> : null}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t('shell.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onSubmit} disabled={busy || selectedCount === 0}>
            {t('shares.revokeSelected', { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
