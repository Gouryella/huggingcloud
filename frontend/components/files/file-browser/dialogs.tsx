'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { File, FolderPlus, Pencil, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { formatBytes } from '@/lib/format';
import { displayRepoPath } from '@/lib/path-display';
import type { FileItem } from '@/lib/types';

import { MIME_BADGE_CLASS, PREVIEW_TEXT_BYTE_LIMIT } from './constants';
import type { PreviewKind } from './types';
import { buildPreviewUrl, fileNameFromPath, previewKindForFile } from './utils';

const AudioWaveformPreview = dynamic(
  () => import('@/components/files/audio-waveform-preview').then((module) => module.AudioWaveformPreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[220px] items-center justify-center text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

const ImageZoomPreview = dynamic(
  () => import('@/components/files/image-zoom-preview').then((module) => module.ImageZoomPreview),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[220px] items-center justify-center text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    ),
  }
);

export function FilePreviewDialog({
  apiBase,
  item,
  open,
  onOpenChange,
}: {
  apiBase: string;
  item: FileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAppPreferences();
  const [textPreview, setTextPreview] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(false);
  const [textTruncated, setTextTruncated] = useState(false);

  const previewKind = useMemo<PreviewKind>(() => {
    if (!item) return 'binary';
    return previewKindForFile(item);
  }, [item]);

  const previewUrl = useMemo(() => {
    if (!item) return '';
    return buildPreviewUrl(apiBase, item.path);
  }, [apiBase, item]);

  const displayPath = item ? displayRepoPath(item.path) : '';

  useEffect(() => {
    if (!open || !item || previewKind !== 'text') {
      setTextPreview('');
      setTextLoading(false);
      setTextError(false);
      setTextTruncated(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setTextLoading(true);
    setTextError(false);
    setTextTruncated(false);

    async function loadTextPreview() {
      try {
        const resp = await fetch(previewUrl, {
          credentials: 'include',
          headers: {
            range: `bytes=0-${PREVIEW_TEXT_BYTE_LIMIT - 1}`,
          },
          signal: controller.signal,
        });
        if (!resp.ok) {
          throw new Error(`preview failed with ${resp.status}`);
        }
        const text = await resp.text();
        if (!active) return;
        const limitedText = text.length > PREVIEW_TEXT_BYTE_LIMIT ? text.slice(0, PREVIEW_TEXT_BYTE_LIMIT) : text;
        setTextPreview(limitedText);
        setTextTruncated(resp.status === 206 || text.length > PREVIEW_TEXT_BYTE_LIMIT);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setTextError(true);
        setTextPreview('');
      } finally {
        if (active) {
          setTextLoading(false);
        }
      }
    }

    void loadTextPreview();

    return () => {
      active = false;
      controller.abort();
    };
  }, [item, open, previewKind, previewUrl]);

  function openInNewTab() {
    if (!previewUrl) return;
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }

  function renderPreview() {
    if (!item) {
      return (
        <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">{t('files.previewEmpty')}</div>
      );
    }

    if (previewKind === 'image') {
      return (
        <ImageZoomPreview
          src={previewUrl}
          alt={displayPath}
          zoomInLabel={t('files.previewZoomIn')}
          zoomOutLabel={t('files.previewZoomOut')}
          zoomResetLabel={t('files.previewZoomReset')}
        />
      );
    }

    if (previewKind === 'video') {
      return <video src={previewUrl} className="h-full max-h-[68vh] w-full rounded-md border border-border bg-black object-contain" controls preload="metadata" />;
    }

    if (previewKind === 'audio') {
      return <AudioWaveformPreview src={previewUrl} className="h-full" />;
    }

    if (previewKind === 'pdf') {
      return <iframe src={previewUrl} title={displayPath} className="h-full min-h-[68vh] w-full rounded-md border border-border bg-background" />;
    }

    if (previewKind === 'text') {
      if (textLoading) {
        return (
          <div className="flex h-full min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t('files.previewLoading')}
          </div>
        );
      }

      if (textError) {
        return (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            <p>{t('files.previewFailed')}</p>
            <Button type="button" variant="outline" onClick={openInNewTab}>
              {t('files.openInNewTab')}
            </Button>
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <div className="max-h-[62vh] overflow-auto rounded-md border border-border bg-background p-4">
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">{textPreview}</pre>
          </div>
          {textTruncated ? <p className="text-xs text-muted-foreground">{t('files.previewTruncated')}</p> : null}
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        <File className="h-10 w-10" />
        <p>{t('files.previewUnsupported')}</p>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[90vh] w-[96vw] max-w-6xl grid-rows-[auto,minmax(0,1fr),auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle>{t('files.previewDialogTitle')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{displayPath || t('files.previewEmpty')}</DialogDescription>
        </DialogHeader>

        <div className="overflow-auto bg-muted/20 p-4 sm:p-6">{renderPreview()}</div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="inline-flex items-center gap-2">
            <Badge variant="outline" className={MIME_BADGE_CLASS}>
              {item?.mime || t('files.unknown')}
            </Badge>
            {item ? <span className="text-xs text-muted-foreground">{formatBytes(item.size)}</span> : null}
          </div>
          <Button type="button" variant="outline" onClick={openInNewTab} disabled={!item}>
            {t('files.openInNewTab')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  currentPrefix,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPrefix: string;
  onCreate: (folderName: string) => boolean;
}) {
  const { t } = useAppPreferences();
  const [folderName, setFolderName] = useState('');
  const currentPathLabel = currentPrefix ? displayRepoPath(currentPrefix) : t('files.rootFolder');

  useEffect(() => {
    if (!open) {
      setFolderName('');
    }
  }, [open]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = onCreate(folderName);
    if (created) {
      setFolderName('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus className="mr-2 h-4 w-4" />
          {t('files.newFolder')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.newFolderTitle')}</DialogTitle>
          <DialogDescription>{t('files.newFolderDesc', { path: currentPathLabel })}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label htmlFor="create-folder-name" className="text-sm font-medium text-foreground">
              {t('files.folderNameLabel')}
            </label>
            <Input
              id="create-folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={t('files.folderNamePlaceholder')}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('shell.cancel')}
            </Button>
            <Button type="submit">{t('files.createFolder')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LinkDialog({
  path,
  displayPath,
  onCreate,
  compact = false,
}: {
  path: string;
  displayPath: string;
  onCreate: (path: string, expiresInSec: number) => Promise<void>;
  compact?: boolean;
}) {
  const [expires, setExpires] = useState('0');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useAppPreferences();

  async function onSubmit() {
    const seconds = Number(expires);
    if (!Number.isFinite(seconds) || seconds < 0) {
      toast.error(t('files.expiresInvalid'));
      return;
    }

    setBusy(true);
    try {
      await onCreate(path, seconds);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={compact ? 'h-7 px-2 text-[11px]' : undefined}
          aria-label={t('files.share')}
        >
          <Share2 className={compact ? 'mr-1 h-3.5 w-3.5' : 'mr-1 h-4 w-4'} />
          {t('files.share')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.createShareLink')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{displayPath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">{t('files.expiresLabel')}</label>
          <Input value={expires} onChange={(e) => setExpires(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setExpires('3600')}>
              1h
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setExpires('86400')}>
              1d
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setExpires('604800')}>
              7d
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setExpires('0')}>
              {t('files.never')}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={busy}>
            {t('files.copyLink')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({
  path,
  displayPath,
  onRename,
  compact = false,
}: {
  path: string;
  displayPath: string;
  onRename: (path: string, nextName: string) => Promise<boolean>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nextName, setNextName] = useState('');
  const { t } = useAppPreferences();

  useEffect(() => {
    if (!open) return;
    setNextName(fileNameFromPath(path));
  }, [open, path]);

  async function onSubmit() {
    setBusy(true);
    try {
      const renamed = await onRename(path, nextName);
      if (renamed) {
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={compact ? 'icon' : 'sm'}
          variant="ghost"
          className={compact ? 'h-7 w-7' : undefined}
          aria-label={t('files.rename')}
        >
          <Pencil className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.renameDialogTitle')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{displayPath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">{t('files.renameLabel')}</label>
          <Input value={nextName} onChange={(e) => setNextName(e.target.value)} placeholder={t('files.renamePlaceholder')} />
          <p className="text-xs text-muted-foreground">{t('files.renameDialogHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t('shell.cancel')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {t('files.rename')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDialog({
  path,
  displayPath,
  onDelete,
  compact = false,
  recursive = false,
  recursiveFileCount = 0,
}: {
  path: string;
  displayPath: string;
  onDelete: (path: string) => Promise<boolean>;
  compact?: boolean;
  recursive?: boolean;
  recursiveFileCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useAppPreferences();
  const safeRecursiveFileCount = Math.max(0, recursiveFileCount);

  async function onSubmit() {
    setBusy(true);
    try {
      const deleted = await onDelete(path);
      if (deleted) {
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={compact ? 'icon' : 'sm'}
          variant="destructive"
          className={compact ? 'h-7 w-7' : undefined}
          aria-label={t('files.delete')}
        >
          <Trash2 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{recursive ? t('files.deleteFolderDialogTitle') : t('files.deleteDialogTitle')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {recursive ? t('files.deleteFolderConfirm', { name: displayPath }) : t('files.deleteConfirm', { name: displayPath })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {recursive ? t('files.deleteFolderDialogHint', { count: safeRecursiveFileCount }) : t('files.deleteDialogHint')}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {t('shell.cancel')}
          </Button>
          <Button type="button" variant="destructive" onClick={onSubmit} disabled={busy}>
            {t('files.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BatchDeleteDialog({
  selectedPaths,
  displayPaths,
  onDelete,
}: {
  selectedPaths: string[];
  displayPaths: string[];
  onDelete: (paths: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { t } = useAppPreferences();

  const selectedCount = selectedPaths.length;
  const previewPaths = displayPaths.slice(0, 5);
  const remainingCount = Math.max(0, selectedCount - previewPaths.length);

  async function onSubmit() {
    if (selectedCount === 0) return;

    setBusy(true);
    try {
      const deleted = await onDelete(selectedPaths);
      if (deleted) {
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
          <Trash2 className="h-4 w-4" />
          {t('files.deleteSelected', { count: selectedCount })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('files.batchDeleteTitle')}</DialogTitle>
          <DialogDescription>{t('files.batchDeleteConfirm', { count: selectedCount })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('files.deleteDialogHint')}</p>
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
            {t('files.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
