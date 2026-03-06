'use client';

import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { File, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { UploadQueueItem, UploadSelectionItem } from './types';
import { buildQueueItemsForUpload, extractSelectionItemsFromTransfer, hasDragFiles, normalizeRelativePath } from './utils';

export function UploadPanel({
  basePrefix,
  onQueueUploads,
}: {
  basePrefix: string;
  onQueueUploads: (entries: UploadQueueItem[]) => void;
}) {
  const [selectedItems, setSelectedItems] = useState<UploadSelectionItem[]>([]);
  const [selectedTotalBytes, setSelectedTotalBytes] = useState(0);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'files' | 'folder'>('files');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const selectedListRef = useRef<HTMLDivElement | null>(null);
  const selectionJobRef = useRef(0);
  const panelDragDepthRef = useRef(0);
  const [panelDropActive, setPanelDropActive] = useState(false);
  const { t } = useAppPreferences();
  const reduceMotion = useReducedMotion();
  const currentUploadPrefix = basePrefix.replace(/^\/+|\/+$/g, '');
  const effectiveUploadPathLabel = `/${currentUploadPrefix}`;

  useEffect(() => {
    const folderInput = folderInputRef.current;
    if (!folderInput) return;

    // Non-standard attributes supported by Chromium/WebKit for folder selection.
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
  }, []);

  const selectedListVirtualizer = useVirtualizer({
    count: selectedItems.length,
    getScrollElement: () => selectedListRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });
  const useVirtualizedSelectionList = selectedItems.length > 300;

  function buildSelectionItem(file: File, mode: 'files' | 'folder'): UploadSelectionItem {
    const browserRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const normalizedRelativePath = browserRelativePath
      ? browserRelativePath
          .trim()
          .replace(/^\/+/, '')
          .replace(/\/{2,}/g, '/')
      : file.name;

    return {
      file,
      relativePath: mode === 'folder' ? normalizedRelativePath || file.name : file.name,
    };
  }

  async function buildSelectionItemsInChunks(files: File[], mode: 'files' | 'folder') {
    const nextItems: UploadSelectionItem[] = new Array(files.length);
    let totalBytes = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      nextItems[i] = buildSelectionItem(file, mode);
      totalBytes += file.size;

      // Yield on large batches to keep UI responsive while parsing many entries.
      if (i > 0 && i % 300 === 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
      }
    }

    return { nextItems, totalBytes };
  }

  function openFilePicker(mode: 'files' | 'folder') {
    const picker = mode === 'files' ? fileInputRef.current : folderInputRef.current;
    if (!picker) return;

    setSelectionMode(mode);
    picker.value = '';
    picker.click();
  }

  function handleSelect(mode: 'files' | 'folder', fileList: FileList | null) {
    const nextFiles = fileList ? Array.from(fileList) : [];
    setSelectionMode(mode);
    const currentJob = selectionJobRef.current + 1;
    selectionJobRef.current = currentJob;

    if (nextFiles.length === 0) {
      setSelectionLoading(false);
      setSelectedItems([]);
      setSelectedTotalBytes(0);
      return;
    }

    setSelectionLoading(true);
    void (async () => {
      const { nextItems, totalBytes } = await buildSelectionItemsInChunks(nextFiles, mode);
      if (selectionJobRef.current !== currentJob) return;
      setSelectedItems(nextItems);
      setSelectedTotalBytes(totalBytes);
      setSelectionLoading(false);
    })();
  }

  function clearPendingSelection() {
    setSelectedItems([]);
    setSelectedTotalBytes(0);
    setSelectionLoading(false);
    setSelectionMode('files');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  }

  function resetPanelDropState() {
    panelDragDepthRef.current = 0;
    setPanelDropActive(false);
  }

  function queueSelectionItems(items: UploadSelectionItem[]) {
    const queueItems = buildQueueItemsForUpload(items, '', basePrefix);
    onQueueUploads(queueItems);
    clearPendingSelection();
  }

  function mergeSelectionItems(currentItems: UploadSelectionItem[], incomingItems: UploadSelectionItem[]) {
    const nextItems = [...currentItems];
    const indexByPath = new Map<string, number>();

    for (let i = 0; i < nextItems.length; i += 1) {
      const item = nextItems[i];
      const key = `${item.relativePath}::${item.file.size}::${item.file.lastModified}`;
      indexByPath.set(key, i);
    }

    for (const item of incomingItems) {
      const key = `${item.relativePath}::${item.file.size}::${item.file.lastModified}`;
      const existingIndex = indexByPath.get(key);
      if (existingIndex === undefined) {
        indexByPath.set(key, nextItems.length);
        nextItems.push(item);
      } else {
        nextItems[existingIndex] = item;
      }
    }

    return nextItems;
  }

  function getImmediateDropItems(dataTransfer: DataTransfer): UploadSelectionItem[] {
    const itemsFromFiles = Array.from(dataTransfer.files || []).map((file) => {
      const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      return {
        file,
        relativePath: normalizeRelativePath(webkitRelativePath || file.name) || file.name,
      };
    });

    const itemsFromDataTransferItems = Array.from(dataTransfer.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .map((file) => {
        const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        return {
          file,
          relativePath: normalizeRelativePath(webkitRelativePath || file.name) || file.name,
        };
      });

    const unique = new Map<string, UploadSelectionItem>();
    for (const item of [...itemsFromFiles, ...itemsFromDataTransferItems]) {
      const key = `${item.relativePath}::${item.file.size}::${item.file.lastModified}`;
      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }
    return Array.from(unique.values());
  }

  function handlePanelDragEnter(event: React.DragEvent<HTMLFormElement>) {
    if (!hasDragFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    panelDragDepthRef.current += 1;
    if (!panelDropActive) {
      setPanelDropActive(true);
    }
  }

  function handlePanelDragOver(event: React.DragEvent<HTMLFormElement>) {
    if (!hasDragFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!panelDropActive) {
      setPanelDropActive(true);
    }
  }

  function handlePanelDragLeave(event: React.DragEvent<HTMLFormElement>) {
    if (!panelDropActive) return;
    event.preventDefault();
    event.stopPropagation();
    panelDragDepthRef.current = Math.max(0, panelDragDepthRef.current - 1);
    if (panelDragDepthRef.current === 0) {
      setPanelDropActive(false);
    }
  }

  async function handlePanelDrop(event: React.DragEvent<HTMLFormElement>) {
    if (!hasDragFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const dataTransfer = event.dataTransfer;
    const currentJob = selectionJobRef.current + 1;
    selectionJobRef.current = currentJob;
    panelDragDepthRef.current = 0;
    setPanelDropActive(true);
    setSelectionLoading(true);

    try {
      const immediateItems = getImmediateDropItems(dataTransfer);
      let droppedItems = immediateItems;

      // For folder drags and browser-specific edge cases, enrich with async extraction.
      const extractedItems = await extractSelectionItemsFromTransfer(dataTransfer);
      if (extractedItems.length > droppedItems.length) {
        droppedItems = extractedItems;
      }

      if (selectionJobRef.current !== currentJob) {
        return;
      }
      if (droppedItems.length === 0) {
        setSelectionLoading(false);
        toast.error(t('files.selectFileFirst'));
        return;
      }

      const mergedItems = mergeSelectionItems(selectedItems, droppedItems);
      const totalBytes = mergedItems.reduce((sum, item) => sum + item.file.size, 0);
      const hasNestedPath = mergedItems.some((item) => item.relativePath.includes('/'));

      setSelectionMode(hasNestedPath ? 'folder' : 'files');
      setSelectedItems(mergedItems);
      setSelectedTotalBytes(totalBytes);
      setSelectionLoading(false);
    } catch (err) {
      if (selectionJobRef.current === currentJob) {
        setSelectionLoading(false);
      }
      toast.error(
        t('files.uploadFailed', {
          error: err instanceof Error ? err.message : t('files.unknown'),
        }),
      );
    } finally {
      resetPanelDropState();
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectionLoading || selectedItems.length === 0) {
      toast.error(t('files.selectFileFirst'));
      return;
    }
    queueSelectionItems(selectedItems);
  }

  return (
    <form
      className="relative space-y-4"
      onSubmit={submit}
      onDragEnter={handlePanelDragEnter}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => handleSelect('files', e.currentTarget.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => handleSelect('folder', e.currentTarget.files)}
      />

      <AnimatePresence>
        {panelDropActive ? (
          <motion.div
            key="upload-panel-drop-overlay"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16 }}
            className="pointer-events-none absolute inset-0 z-30 rounded-xl border-2 border-dashed border-zinc-400 bg-zinc-100/88 p-4 dark:border-zinc-600 dark:bg-zinc-950/88"
          >
            <div className="mx-auto mt-12 max-w-lg rounded-lg border border-zinc-300 bg-zinc-50/95 px-4 py-3 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {selectionLoading ? t('files.uploadPreparingSelection') : t('files.uploadDropQuickTitle')}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {t('files.uploadDropQuickHint', { path: effectiveUploadPathLabel })}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('files.uploadSourceTitle')}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('files.uploadSourceDesc')}</p>
          </div>
          <Badge variant="outline" className="shrink-0 border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
            {selectionLoading
              ? t('files.uploadPreparingSelection')
              : selectedItems.length > 0
                ? t('files.uploadSelectionSummary', { count: selectedItems.length, size: formatBytes(selectedTotalBytes) })
                : t('files.uploadNoSelectionShort')}
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              'justify-start border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-600',
              selectionMode === 'files'
                ? 'border-zinc-900 bg-zinc-900 text-zinc-50 hover:border-zinc-900 hover:bg-zinc-800 hover:text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:border-zinc-100 dark:hover:bg-zinc-200 dark:hover:text-zinc-900'
                : undefined,
            )}
            onClick={() => openFilePicker('files')}
            disabled={selectionLoading}
          >
            <File className="h-4 w-4" />
            {t('files.uploadPickFiles')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'justify-start border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-600',
              selectionMode === 'folder'
                ? 'border-zinc-900 bg-zinc-900 text-zinc-50 hover:border-zinc-900 hover:bg-zinc-800 hover:text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:border-zinc-100 dark:hover:bg-zinc-200 dark:hover:text-zinc-900'
                : undefined,
            )}
            onClick={() => openFilePicker('folder')}
            disabled={selectionLoading}
          >
            <FolderOpen className="h-4 w-4" />
            {t('files.uploadPickFolder')}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('files.uploadFolderStructureHint')}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{selectedItems.length}</p>
        </div>
        <div className="mt-3">
          {selectionLoading ? (
            <div className="flex h-64 items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-100 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('files.uploadPreparingSelection')}
            </div>
          ) : selectedItems.length > 0 ? (
            <div ref={selectedListRef} className="h-64 overflow-auto rounded-md border border-zinc-200 bg-zinc-100 p-2 dark:border-zinc-700 dark:bg-zinc-800">
              {useVirtualizedSelectionList ? (
                <div className="relative w-full" style={{ height: `${selectedListVirtualizer.getTotalSize()}px` }}>
                  {selectedListVirtualizer.getVirtualItems().map((row) => {
                    const item = selectedItems[row.index];
                    return (
                      <div
                        key={row.key}
                        className="absolute left-0 top-0 w-full"
                        style={{ transform: `translateY(${row.start}px)`, height: `${row.size}px` }}
                      >
                        <div className="mx-1 mt-0.5 flex h-[calc(100%-4px)] items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
                          <p className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100" title={item.relativePath}>
                            {item.relativePath}
                          </p>
                          <p className="shrink-0 text-[11px] text-zinc-600 dark:text-zinc-400">{formatBytes(item.file.size)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {selectedItems.map((item) => (
                    <div key={`${item.relativePath}-${item.file.size}-${item.file.lastModified}`} className="mx-1 flex min-h-8 items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100" title={item.relativePath}>
                        {item.relativePath}
                      </p>
                      <p className="shrink-0 text-[11px] text-zinc-600 dark:text-zinc-400">{formatBytes(item.file.size)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-100 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {t('files.uploadNoSelectionShort')}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-full items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="shrink-0 font-medium">{t('files.uploadCurrentPathLabel')}</span>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1 font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span className="truncate" title={effectiveUploadPathLabel}>
              {effectiveUploadPathLabel}
            </span>
          </span>
        </div>
        <Button
          className="w-full border-zinc-900 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 focus-visible:ring-zinc-400 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-600 sm:w-auto sm:min-w-36"
          type="submit"
          disabled={selectionLoading || selectedItems.length === 0}
        >
          {t('files.startUpload')}
        </Button>
      </div>
    </form>
  );
}
