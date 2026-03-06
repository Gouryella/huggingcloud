'use client';

import type { MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { ArrowUpDown, ChevronDown, ChevronUp, Copy, File, FolderOpen, LayoutGrid, Table2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBytes, formatDateTime } from '@/lib/format';
import { displayRepoPath } from '@/lib/path-display';
import type { FileItem } from '@/lib/types';
import { cn } from '@/lib/utils';

import { DeleteDialog, LinkDialog, RenameDialog } from './dialogs';
import { MIME_BADGE_CLASS, ZINC_CHECKBOX_CLASS } from './constants';
import type { BrowserEntry, FileSortKey, SortDirection, TranslateFn } from './types';
import { buildPreviewUrl, fileNameFromPath, fileUploadedAt, previewKindForFile } from './utils';

export type FileViewMode = 'table' | 'preview';

type FileEntriesPanelProps = {
  entries: BrowserEntry[];
  viewMode: FileViewMode;
  reduceMotion: boolean | null;
  t: TranslateFn;
  sortKey: FileSortKey;
  sortDirection: SortDirection;
  onToggleSort: (key: FileSortKey) => void;
  currentPagePaths: string[];
  currentPageCheckState: boolean | 'indeterminate';
  selectedPaths: Set<string>;
  isSearchMode: boolean;
  apiBase: string;
  shiftSelectionRef: MutableRefObject<boolean>;
  onToggleCurrentPageSelection: (checked: boolean) => void;
  onOpenFolder: (path: string) => void;
  onSetPreviewingFile: (item: FileItem) => void;
  onUpdatePathSelection: (path: string, checked: boolean, shiftKey: boolean) => void;
  onCreateLink: (path: string, expiresInSec?: number) => Promise<void>;
  onRenameFile: (path: string, nextName: string) => Promise<boolean>;
  onDeleteFile: (path: string) => Promise<boolean>;
  onDeleteFolder: (path: string) => Promise<boolean>;
};

type FileViewModeToggleProps = {
  viewMode: FileViewMode;
  onChange: (viewMode: FileViewMode) => void;
  reduceMotion: boolean | null;
  t: TranslateFn;
};

function sortLabel(t: TranslateFn, sortKey: FileSortKey, sortDirection: SortDirection, key: FileSortKey) {
  if (sortKey !== key) return t('files.sortToggleHint');
  return sortDirection === 'asc' ? t('files.sortDesc') : t('files.sortAsc');
}

function renderSortIcon(sortKey: FileSortKey, sortDirection: SortDirection, key: FileSortKey) {
  if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/80" />;
  return sortDirection === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5 text-foreground" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 text-foreground" />
  );
}

function SortableHeader({
  label,
  sortKey,
  sortDirection,
  headerKey,
  onToggleSort,
  t,
}: {
  label: string;
  sortKey: FileSortKey;
  sortDirection: SortDirection;
  headerKey: FileSortKey;
  onToggleSort: (key: FileSortKey) => void;
  t: TranslateFn;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-8 gap-1 px-2 font-semibold text-foreground hover:bg-muted"
      onClick={() => onToggleSort(headerKey)}
      aria-label={`${label} · ${sortLabel(t, sortKey, sortDirection, headerKey)}`}
    >
      <span>{label}</span>
      {renderSortIcon(sortKey, sortDirection, headerKey)}
    </Button>
  );
}

export function FileViewModeToggle({ viewMode, onChange, reduceMotion, t }: FileViewModeToggleProps) {
  return (
    <div role="tablist" aria-label={`${t('files.list')} ${t('files.preview')}`} className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1">
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === 'table'}
        onClick={() => onChange('table')}
        className="relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium"
      >
        {viewMode === 'table' ? (
          <motion.span
            layoutId="files-view-mode-indicator"
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34, mass: 0.65 }}
            className="absolute inset-0 rounded-md bg-zinc-900 shadow-sm dark:bg-zinc-100"
          />
        ) : null}
        <Table2
          className={`relative z-10 h-4 w-4 transition-colors ${
            viewMode === 'table' ? 'text-white dark:text-zinc-900' : 'text-muted-foreground'
          }`}
        />
        <span
          className={`relative z-10 transition-colors ${
            viewMode === 'table' ? 'text-white dark:text-zinc-900' : 'text-muted-foreground'
          }`}
        >
          {t('files.list')}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === 'preview'}
        onClick={() => onChange('preview')}
        className="relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium"
      >
        {viewMode === 'preview' ? (
          <motion.span
            layoutId="files-view-mode-indicator"
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34, mass: 0.65 }}
            className="absolute inset-0 rounded-md bg-zinc-900 shadow-sm dark:bg-zinc-100"
          />
        ) : null}
        <LayoutGrid
          className={`relative z-10 h-4 w-4 transition-colors ${
            viewMode === 'preview' ? 'text-white dark:text-zinc-900' : 'text-muted-foreground'
          }`}
        />
        <span
          className={`relative z-10 transition-colors ${
            viewMode === 'preview' ? 'text-white dark:text-zinc-900' : 'text-muted-foreground'
          }`}
        >
          {t('files.preview')}
        </span>
      </button>
    </div>
  );
}

export function FileEntriesPanel({
  entries,
  viewMode,
  reduceMotion,
  t,
  sortKey,
  sortDirection,
  onToggleSort,
  currentPagePaths,
  currentPageCheckState,
  selectedPaths,
  isSearchMode,
  apiBase,
  shiftSelectionRef,
  onToggleCurrentPageSelection,
  onOpenFolder,
  onSetPreviewingFile,
  onUpdatePathSelection,
  onCreateLink,
  onRenameFile,
  onDeleteFile,
  onDeleteFolder,
}: FileEntriesPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-4 text-base font-medium text-foreground">{t('files.noFiles')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('files.noFilesHint')}</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {viewMode === 'table' ? (
        <motion.div
          key="files-view-table"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="overflow-hidden rounded-xl border border-border bg-card" style={{ contentVisibility: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      className={cn('align-middle', ZINC_CHECKBOX_CLASS)}
                      checked={currentPageCheckState}
                      disabled={currentPagePaths.length === 0}
                      onCheckedChange={(checked) => onToggleCurrentPageSelection(checked === true)}
                      aria-label={t('files.selectPage')}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label={t('files.fileName')}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      headerKey="name"
                      onToggleSort={onToggleSort}
                      t={t}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label={t('files.size')}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      headerKey="size"
                      onToggleSort={onToggleSort}
                      t={t}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label={t('files.uploaded')}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      headerKey="uploaded"
                      onToggleSort={onToggleSort}
                      t={t}
                    />
                  </TableHead>
                  <TableHead>
                    <SortableHeader
                      label={t('files.mime')}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      headerKey="mime"
                      onToggleSort={onToggleSort}
                      t={t}
                    />
                  </TableHead>
                  <TableHead className="text-right">{t('files.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  if (entry.kind === 'folder') {
                    const displayPath = displayRepoPath(entry.path);
                    return (
                      <TableRow key={`folder:${entry.path}`}>
                        <TableCell className="w-10" />
                        <TableCell className="font-mono text-xs md:text-sm">
                          <button
                            type="button"
                            className="inline-flex max-w-full items-center gap-2 truncate text-left text-zinc-900 hover:underline dark:text-zinc-100"
                            onClick={() => onOpenFolder(entry.path)}
                            title={displayPath}
                          >
                            <FolderOpen className="h-4 w-4 shrink-0" />
                            <span className="truncate">{fileNameFromPath(displayPath)}</span>
                          </button>
                        </TableCell>
                        <TableCell>{t('files.folderFileCount', { count: entry.fileCount })}</TableCell>
                        <TableCell>{formatDateTime(entry.latestModified)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{t('files.folderLabel')}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOpenFolder(entry.path)} aria-label={t('files.enterFolder')}>
                              <FolderOpen className="h-3.5 w-3.5" />
                            </Button>
                            <DeleteDialog
                              path={entry.path}
                              displayPath={displayPath}
                              onDelete={onDeleteFolder}
                              recursive
                              recursiveFileCount={entry.fileCount}
                              compact
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const item = entry.file;
                  const displayPath = displayRepoPath(item.path);
                  return (
                    <TableRow key={item.path}>
                      <TableCell className="w-10">
                        <Checkbox
                          className={cn('align-middle', ZINC_CHECKBOX_CLASS)}
                          checked={selectedPaths.has(item.path)}
                          onPointerDown={(event) => {
                            shiftSelectionRef.current = event.shiftKey;
                          }}
                          onClick={(event) => {
                            shiftSelectionRef.current = event.shiftKey;
                          }}
                          onCheckedChange={(checked) => {
                            onUpdatePathSelection(item.path, checked === true, shiftSelectionRef.current);
                            shiftSelectionRef.current = false;
                          }}
                          aria-label={t('files.selectFile', { name: displayRepoPath(item.path) })}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs md:text-sm">
                        <button
                          type="button"
                          className="truncate text-left text-zinc-900 hover:underline dark:text-zinc-100"
                          onClick={() => onSetPreviewingFile(item)}
                          title={displayPath}
                        >
                          {isSearchMode ? displayPath : fileNameFromPath(displayPath)}
                        </button>
                      </TableCell>
                      <TableCell>{formatBytes(item.size)}</TableCell>
                      <TableCell>{formatDateTime(fileUploadedAt(item))}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={MIME_BADGE_CLASS}>
                          {item.mime || t('files.unknown')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <LinkDialog path={item.path} displayPath={displayPath} onCreate={onCreateLink} compact />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => onCreateLink(item.path, 0)}
                            aria-label={t('files.copyLink')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <RenameDialog path={item.path} displayPath={displayPath} onRename={onRenameFile} compact />
                          <DeleteDialog path={item.path} displayPath={displayPath} onDelete={onDeleteFile} compact />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="files-view-preview"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" style={{ contentVisibility: 'auto' }}>
            {entries.map((entry) => {
              if (entry.kind === 'folder') {
                const displayPath = displayRepoPath(entry.path);
                return (
                  <div
                    key={`folder:${entry.path}`}
                    className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white text-left text-zinc-900 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500"
                  >
                    <button type="button" className="w-full text-left" onClick={() => onOpenFolder(entry.path)}>
                      <div className="flex aspect-video items-center justify-center border-b border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                        <FolderOpen className="h-10 w-10" />
                      </div>
                      <div className="space-y-2 p-3">
                        <p className="truncate font-mono text-xs text-zinc-900 hover:underline dark:text-zinc-100" title={displayPath}>
                          {displayPath}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline">{t('files.folderLabel')}</Badge>
                          <span className="text-xs text-muted-foreground">{t('files.folderFileCount', { count: entry.fileCount })}</span>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 px-3 pb-3">
                      <Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-[11px]" onClick={() => onOpenFolder(entry.path)}>
                        <FolderOpen className="mr-1 h-3.5 w-3.5" />
                        {t('files.enterFolder')}
                      </Button>
                      <DeleteDialog
                        path={entry.path}
                        displayPath={displayPath}
                        onDelete={onDeleteFolder}
                        recursive
                        recursiveFileCount={entry.fileCount}
                        compact
                      />
                    </div>
                  </div>
                );
              }

              const item = entry.file;
              const src = buildPreviewUrl(apiBase, item.path);
              const displayPath = displayRepoPath(item.path);
              const previewKind = previewKindForFile(item);
              return (
                <div key={item.path} className="relative overflow-hidden rounded-xl border border-border bg-card">
                  <label className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/85 shadow-sm backdrop-blur-sm">
                    <Checkbox
                      className={cn('h-3.5 w-3.5', ZINC_CHECKBOX_CLASS)}
                      checked={selectedPaths.has(item.path)}
                      onPointerDown={(event) => {
                        shiftSelectionRef.current = event.shiftKey;
                      }}
                      onClick={(event) => {
                        shiftSelectionRef.current = event.shiftKey;
                      }}
                      onCheckedChange={(checked) => {
                        onUpdatePathSelection(item.path, checked === true, shiftSelectionRef.current);
                        shiftSelectionRef.current = false;
                      }}
                      aria-label={t('files.selectFile', { name: displayPath })}
                    />
                  </label>
                  <button type="button" className="w-full text-left" onClick={() => onSetPreviewingFile(item)}>
                    <div className="relative aspect-video border-b border-border bg-muted/50">
                      {previewKind === 'image' ? (
                        <Image
                          src={src}
                          alt={displayPath}
                          fill
                          unoptimized
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover"
                        />
                      ) : previewKind === 'video' ? (
                        <video src={src} className="h-full w-full object-cover" preload="metadata" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <File className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="truncate font-mono text-xs text-zinc-900 hover:underline dark:text-zinc-100" title={displayPath}>
                        {displayPath}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={MIME_BADGE_CLASS}>
                          {item.mime || t('files.unknown')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatBytes(item.size)}</span>
                      </div>
                    </div>
                  </button>
                  <div className="flex gap-1 px-3 pb-3">
                    <Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-[11px]" onClick={() => onCreateLink(item.path, 0)}>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {t('files.copyLink')}
                    </Button>
                    <RenameDialog path={item.path} displayPath={displayRepoPath(item.path)} onRename={onRenameFile} compact />
                    <DeleteDialog path={item.path} displayPath={displayRepoPath(item.path)} onDelete={onDeleteFile} compact />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
