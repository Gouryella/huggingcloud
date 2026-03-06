'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, RefreshCw, Search, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';

import { PaginationNav } from '@/components/pagination-nav';
import { PageSizeSelect } from '@/components/page-size-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppPreferences } from '@/hooks/use-app-preferences';
import { usePersistedViewMode } from '@/hooks/use-persisted-view-mode';
import { ApiError, clientApiFetch } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { displayRepoPath } from '@/lib/path-display';
import type { FileItem, FileListResponse, UploadSessionInfo } from '@/lib/types';

import { BatchDeleteDialog, CreateFolderDialog, FilePreviewDialog } from './file-browser/dialogs';
import {
  FILE_LIST_FETCH_LIMIT,
  FINISHED_UPLOAD_AUTO_CLEAR_DELAY_MS,
  FOLDER_MARKER_FILE_NAME,
  PAGE_SIZE_OPTIONS,
  UPLOAD_CANCELLED_ERROR,
} from './file-browser/constants';
import { FileEntriesPanel, FileViewModeToggle } from './file-browser/entries-panel';
import { StatCard } from './file-browser/stat-card';
import type { UploadQueueItem, UploadTask } from './file-browser/types';
import { UploadCenter } from './file-browser/upload-center';
import { UploadPanel } from './file-browser/upload-panel';
import { useFileBrowserState } from './file-browser/use-file-browser-state';
import {
  buildFilesRoute,
  buildQueueItemsForUpload,
  buildRenameDestination,
  buildUploadResumeKey,
  buildUploadTaskId,
  calcUploadedBytesByChunks,
  clearResumeRecord,
  extractSelectionItemsFromTransfer,
  fileNameFromPath,
  getChunkBytes,
  getResumeRecord,
  hasDragFiles,
  isTaskActive,
  normalizeUploadPath,
  normalizeUploadChunkSizeForFile,
  parentPath,
  resolveAdaptiveUploadChunkSize,
  setResumeRecord,
  sleep,
  uploadProgress,
  validateSimpleName,
} from './file-browser/utils';

function toastApiError(err: unknown, fallbackMessage: string) {
  if (err instanceof ApiError) {
    toast.error(err.message);
    return;
  }
  toast.error(fallbackMessage);
}

function errorMessage(err: unknown, fallbackMessage: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallbackMessage;
}

export function FileBrowser({
  initialItems,
  initialCursor,
  initialPrefix,
  initialQuery,
  initialTotalFiles,
  initialTotalSizeBytes,
  initialStorageCapacityBytes,
  initialStorageRemainingBytes,
}: {
  initialItems: FileItem[];
  initialCursor?: string | null;
  initialPrefix?: string;
  initialQuery?: string;
  initialTotalFiles: number;
  initialTotalSizeBytes: number;
  initialStorageCapacityBytes: number | null;
  initialStorageRemainingBytes: number | null;
}) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const prefix = initialPrefix || '';
  const { t } = useAppPreferences();
  const reduceMotion = useReducedMotion();
  const [totalFiles, setTotalFiles] = useState(initialTotalFiles);
  const [totalSizeBytes, setTotalSizeBytes] = useState(initialTotalSizeBytes);
  const [storageCapacityBytes, setStorageCapacityBytes] = useState<number | null>(initialStorageCapacityBytes);
  const [storageRemainingBytes, setStorageRemainingBytes] = useState<number | null>(initialStorageRemainingBytes);
  const [loading, setLoading] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadCenterExpanded, setUploadCenterExpanded] = useState(false);
  const { viewMode, setViewMode } = usePersistedViewMode('hf.view_mode.files', 'table');
  const [previewingFile, setPreviewingFile] = useState<FileItem | null>(null);
  const shiftSelectionRef = useRef(false);
  const pageDragDepthRef = useRef(0);
  const uploadCancelRequestRef = useRef<Map<string, boolean>>(new Map());
  const activeUploadAbortRef = useRef<Map<string, AbortController>>(new Map());
  const finishedUploadAutoClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [pageDropActive, setPageDropActive] = useState(false);
  const [pageDropParsing, setPageDropParsing] = useState(false);
  const {
    setItems,
    nextCursor,
    setNextCursor,
    query,
    setQuery,
    appliedQuery,
    setAppliedQuery,
    isSearchMode,
    existingFolderPaths,
    sortKey,
    sortDirection,
    toggleSort,
    page,
    setPage,
    pageSize,
    handlePageSizeChange,
    loadedPageCount,
    displayPageCount,
    currentPageEntries,
    currentPagePaths,
    selectedPaths,
    setSelectedPaths,
    setSelectionAnchorPath,
    selectedCount,
    allCurrentPageSelected,
    currentPageCheckState,
    selectedOrderedPaths,
    selectedDisplayPaths,
    updatePathSelection,
    toggleCurrentPageSelection,
    clearSelection,
  } = useFileBrowserState({
    initialItems,
    initialCursor,
    initialQuery,
    prefix,
  });

  const uploadSummary = useMemo(() => {
    const totalBytes = uploadTasks.reduce((sum, task) => sum + task.size, 0);
    const uploadedBytes = uploadTasks.reduce((sum, task) => sum + Math.min(task.uploadedBytes, task.size), 0);

    let active = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    for (const task of uploadTasks) {
      if (task.status === 'completed') completed += 1;
      else if (task.status === 'failed') failed += 1;
      else if (task.status === 'cancelled') cancelled += 1;
      else if (isTaskActive(task.status)) active += 1;
    }

    return {
      totalProgress: uploadProgress(uploadedBytes, totalBytes),
      active,
      completed,
      failed,
      cancelled,
      totalBytes,
      uploadedBytes,
    };
  }, [uploadTasks]);

  async function refetch(cursor?: string | null, nextQuery?: string) {
    const searchQuery = (nextQuery ?? appliedQuery).trim();
    const useGlobalSearch = searchQuery.length > 0;
    const params = new URLSearchParams();
    if (!useGlobalSearch && prefix) params.set('prefix', prefix);
    if (searchQuery) params.set('q', searchQuery);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(FILE_LIST_FETCH_LIMIT));

    const resp = await clientApiFetch<FileListResponse>(`/api/files?${params.toString()}`);
    if (cursor) {
      setItems((prev) => {
        const map = new Map(prev.map((item) => [item.path, item]));
        for (const item of resp.items) map.set(item.path, item);
        return Array.from(map.values());
      });
    } else {
      setItems(resp.items);
      setPage(1);
    }
    setNextCursor(resp.next_cursor);
    setAppliedQuery(searchQuery);
    setTotalFiles(resp.total_files);
    setTotalSizeBytes(resp.total_size_bytes);
    setStorageCapacityBytes(resp.storage_capacity_bytes ?? null);
    setStorageRemainingBytes(resp.storage_remaining_bytes ?? null);
  }

  async function refreshNow() {
    setLoading(true);
    try {
      const useGlobalSearch = appliedQuery.length > 0;
      const search = new URLSearchParams();
      if (!useGlobalSearch && prefix) search.set('prefix', prefix);
      await clientApiFetch(`/api/files/refresh?${search.toString()}`, { method: 'POST' });
      await refetch();
      toast.success(t('files.fileIndexRefreshed'));
    } catch (err) {
      toastApiError(err, t('files.refreshFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await refetch(undefined, query);
    } catch (err) {
      toastApiError(err, t('files.searchFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function clearSearch() {
    if (!query.trim() && !appliedQuery) return;
    setQuery('');
    setLoading(true);
    try {
      await refetch(undefined, '');
    } catch (err) {
      toastApiError(err, t('files.searchFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function goToPage(nextPage: number) {
    if (nextPage < 1 || loading) return;

    if (nextPage <= loadedPageCount) {
      setPage(nextPage);
      return;
    }

    if (nextPage === loadedPageCount + 1 && nextCursor) {
      setLoading(true);
      try {
        await refetch(nextCursor);
        setPage(nextPage);
      } catch (err) {
        toastApiError(err, t('files.loadNextFailed'));
      } finally {
        setLoading(false);
      }
    }
  }

  useEffect(
    () => () => {
      activeUploadAbortRef.current.forEach((controller) => controller.abort());
      activeUploadAbortRef.current.clear();
      uploadCancelRequestRef.current.clear();
      finishedUploadAutoClearTimersRef.current.forEach((timerId) => {
        clearTimeout(timerId);
      });
      finishedUploadAutoClearTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!uploadDialogOpen) return;
    pageDragDepthRef.current = 0;
    setPageDropActive(false);
    setPageDropParsing(false);
  }, [uploadDialogOpen]);

  useEffect(() => {
    const timers = finishedUploadAutoClearTimersRef.current;
    const liveTaskIds = new Set(uploadTasks.map((task) => task.id));

    for (const task of uploadTasks) {
      const shouldAutoClear = task.status === 'completed' || task.status === 'cancelled';
      const existingTimer = timers.get(task.id);
      if (shouldAutoClear && !existingTimer) {
        const timerId = setTimeout(() => {
          setUploadTasks((prev) => prev.filter((item) => item.id !== task.id));
          finishedUploadAutoClearTimersRef.current.delete(task.id);
        }, FINISHED_UPLOAD_AUTO_CLEAR_DELAY_MS);
        timers.set(task.id, timerId);
      } else if (!shouldAutoClear && existingTimer) {
        clearTimeout(existingTimer);
        timers.delete(task.id);
      }
    }

    for (const [taskId, timerId] of timers) {
      if (!liveTaskIds.has(taskId)) {
        clearTimeout(timerId);
        timers.delete(taskId);
      }
    }
  }, [uploadTasks]);

  async function createLink(path: string, expiresInSec = 0) {
    try {
      const payload = {
        path,
        expires_in_sec: expiresInSec,
        one_time: false,
      };
      const resp = await clientApiFetch<{ link_id: string; url: string; short_url?: string; expires_at: string }>('/api/links', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await navigator.clipboard.writeText(resp.short_url || resp.url);
      toast.success(t('files.shareCopied'));
    } catch (err) {
      toast.error(t('files.createLinkFailed', { error: errorMessage(err, t('files.unknown')) }));
    }
  }

  function openFolder(targetPrefix: string) {
    router.push(buildFilesRoute(targetPrefix));
  }

  function goToParentFolder() {
    if (!prefix) return;
    openFolder(parentPath(prefix));
  }

  function queueCreateFolder(folderNameInput: string) {
    const folderName = folderNameInput.trim();
    const nameValidation = validateSimpleName(folderName);
    if (nameValidation === 'empty') {
      toast.error(t('files.createFolderEmptyName'));
      return false;
    }
    if (nameValidation === 'invalid') {
      toast.error(t('files.createFolderInvalidName'));
      return false;
    }

    const markerPath = normalizeUploadPath(prefix, `${folderName}/${FOLDER_MARKER_FILE_NAME}`, FOLDER_MARKER_FILE_NAME);
    const folderPath = parentPath(markerPath);
    if (existingFolderPaths.has(folderPath)) {
      toast.error(t('files.createFolderExists'));
      return false;
    }

    const markerFile = new window.File([`folder-marker:${new Date().toISOString()}\n`], FOLDER_MARKER_FILE_NAME, {
      type: 'text/plain',
      lastModified: Date.now(),
    });

    queueUploads([{ file: markerFile, targetPath: markerPath }]);
    setCreateFolderDialogOpen(false);
    openFolder(folderPath);
    return true;
  }

  function resetPageDropState() {
    pageDragDepthRef.current = 0;
    setPageDropActive(false);
  }

  function handlePageDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (uploadDialogOpen || !hasDragFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    pageDragDepthRef.current += 1;
    if (!pageDropActive) {
      setPageDropActive(true);
    }
  }

  function handlePageDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (uploadDialogOpen || !hasDragFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!pageDropActive) {
      setPageDropActive(true);
    }
  }

  function handlePageDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (uploadDialogOpen || !pageDropActive) return;
    event.preventDefault();
    event.stopPropagation();
    pageDragDepthRef.current = Math.max(0, pageDragDepthRef.current - 1);
    if (pageDragDepthRef.current === 0) {
      setPageDropActive(false);
    }
  }

  async function handlePageDrop(event: React.DragEvent<HTMLDivElement>) {
    if (uploadDialogOpen || !hasDragFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    pageDragDepthRef.current = 0;
    setPageDropActive(true);
    setPageDropParsing(true);

    try {
      const droppedItems = await extractSelectionItemsFromTransfer(event.dataTransfer);
      if (droppedItems.length === 0) {
        toast.error(t('files.selectFileFirst'));
        return;
      }
      queueUploads(buildQueueItemsForUpload(droppedItems, '', prefix));
    } catch (err) {
      toast.error(
        t('files.uploadFailed', {
          error: err instanceof Error ? err.message : t('files.unknown'),
        }),
      );
    } finally {
      setPageDropParsing(false);
      resetPageDropState();
    }
  }

  async function deleteFile(path: string, options?: { silent?: boolean; recursive?: boolean }) {
    const silent = options?.silent ?? false;
    const recursive = options?.recursive ?? false;
    try {
      await clientApiFetch('/api/files', {
        method: 'DELETE',
        body: JSON.stringify({ path, recursive }),
      });
      setItems((prev) => prev.filter((item) => item.path !== path && (!recursive || !item.path.startsWith(`${path}/`))));
      setSelectedPaths((prev) => {
        let changed = false;
        const next = new Set<string>();
        for (const selectedPath of prev) {
          const shouldRemove = selectedPath === path || (recursive && selectedPath.startsWith(`${path}/`));
          if (shouldRemove) {
            changed = true;
            continue;
          }
          next.add(selectedPath);
        }
        return changed ? next : prev;
      });
      setSelectionAnchorPath((prev) => {
        if (!prev) return prev;
        return prev === path || (recursive && prev.startsWith(`${path}/`)) ? null : prev;
      });
      setPreviewingFile((prev) => {
        if (!prev) return prev;
        return prev.path === path || (recursive && prev.path.startsWith(`${path}/`)) ? null : prev;
      });
      if (!silent) {
        toast.success(t('files.fileDeleted'));
      }
      return true;
    } catch (err) {
      if (!silent) {
        toastApiError(err, t('files.deleteFailed'));
      }
      return false;
    }
  }

  async function deleteSelectedFiles(paths: string[]) {
    if (paths.length === 0) return false;

    let deletedCount = 0;
    for (const path of paths) {
      const deleted = await deleteFile(path, { silent: true });
      if (deleted) deletedCount += 1;
    }

    const failedCount = paths.length - deletedCount;
    if (deletedCount > 0) {
      toast.success(t('files.batchDeleteSuccess', { count: deletedCount }));
    }
    if (failedCount > 0) {
      toast.error(t('files.batchDeleteFailed', { count: failedCount }));
    }
    return failedCount === 0;
  }

  async function renameFile(path: string, nextName: string) {
    const sanitizedName = nextName.trim();
    const nameValidation = validateSimpleName(sanitizedName);
    if (nameValidation === 'empty') {
      toast.error(t('files.renameEmptyName'));
      return false;
    }
    if (nameValidation === 'invalid') {
      toast.error(t('files.renameInvalidName'));
      return false;
    }

    const currentName = fileNameFromPath(path);
    if (sanitizedName === currentName) {
      toast.message(t('files.renameNoChange'));
      return false;
    }

    const destination = buildRenameDestination(path, sanitizedName);
    try {
      await clientApiFetch('/api/files/move', {
        method: 'POST',
        body: JSON.stringify({
          source_path: path,
          destination_path: destination,
        }),
      });

      setItems((prev) => prev.map((item) => (item.path === path ? { ...item, path: destination } : item)));
      setSelectedPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        next.add(destination);
        return next;
      });
      setSelectionAnchorPath((prev) => (prev === path ? destination : prev));
      setPreviewingFile((prev) => (prev && prev.path === path ? { ...prev, path: destination } : prev));
      toast.success(t('files.renameSuccess'));
      return true;
    } catch (err) {
      toast.error(t('files.renameFailed', { error: errorMessage(err, t('files.unknown')) }));
      return false;
    }
  }

  function updateUploadTask(taskId: string, updater: (task: UploadTask) => UploadTask) {
    setUploadTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)));
  }

  function queueUploads(entries: UploadQueueItem[]) {
    if (entries.length === 0) return;

    const activeResumeKeys = new Set(uploadTasks.filter((task) => isTaskActive(task.status)).map((task) => task.resumeKey));
    const filteredEntries = entries.filter((entry) => !activeResumeKeys.has(buildUploadResumeKey(entry.file, entry.targetPath)));
    const skippedCount = entries.length - filteredEntries.length;
    if (filteredEntries.length === 0) {
      toast.message(t('files.uploadAlreadyRunning'));
      return;
    }

    const tasks: UploadTask[] = filteredEntries.map((entry) => {
      const chunkSize = resolveAdaptiveUploadChunkSize(entry.file.size);
      const totalChunks = Math.max(1, Math.ceil(entry.file.size / chunkSize));
      return {
        id: buildUploadTaskId(),
        file: entry.file,
        path: entry.targetPath,
        fileName: entry.file.name,
        size: entry.file.size,
        uploadedBytes: 0,
        progress: 0,
        status: 'uploading',
        chunkSize,
        completedChunks: 0,
        totalChunks,
        resumeKey: buildUploadResumeKey(entry.file, entry.targetPath),
        createdAt: Date.now(),
      };
    });

    setUploadTasks((prev) => [...tasks, ...prev]);
    setUploadCenterExpanded(false);
    setUploadDialogOpen(false);
    toast.success(t('files.uploadQueuedBackground', { count: tasks.length }));
    if (skippedCount > 0) {
      toast.message(t('files.uploadSkippedDuplicates', { count: skippedCount }));
    }

    for (const task of tasks) {
      void runUploadTask(task.id, task.file, task.path, task.resumeKey, task.chunkSize);
    }
  }

  function requestCancelUploadTask(taskId: string) {
    const task = uploadTasks.find((item) => item.id === taskId);
    if (!task || !isTaskActive(task.status)) return;

    uploadCancelRequestRef.current.set(taskId, true);
    updateUploadTask(taskId, (current) => ({
      ...current,
      status: 'cancelling',
      message: t('files.uploadCancelling'),
    }));
    activeUploadAbortRef.current.get(taskId)?.abort();
  }

  function retryUploadTask(taskId: string) {
    const task = uploadTasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'failed') return;

    uploadCancelRequestRef.current.delete(taskId);
    updateUploadTask(taskId, (current) => ({
      ...current,
      status: 'uploading',
      message: undefined,
    }));
    toast.message(t('files.uploadRetrying', { name: task.fileName }));
    void runUploadTask(task.id, task.file, task.path, task.resumeKey, task.chunkSize);
  }

  function clearFailedUploadTasks() {
    setUploadTasks((prev) => prev.filter((task) => task.status !== 'failed'));
  }

  async function runUploadTask(taskId: string, file: File, targetPath: string, resumeKey: string, preferredChunkSize?: number) {
    const throwIfCancelled = () => {
      if (uploadCancelRequestRef.current.get(taskId)) {
        throw new Error(UPLOAD_CANCELLED_ERROR);
      }
    };
    const isCancelledError = (err: unknown) => err instanceof Error && err.message === UPLOAD_CANCELLED_ERROR;

    let uploadId: string | undefined;
    let chunkSize = resolveAdaptiveUploadChunkSize(file.size, preferredChunkSize);
    let uploadedBytes = 0;
    let completedChunks = 0;
    const receivedChunks = new Set<number>();

    const applyProgress = (extra?: Partial<UploadTask>) => {
      const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
      updateUploadTask(taskId, (task) => ({
        ...task,
        uploadId,
        chunkSize,
        totalChunks,
        completedChunks,
        uploadedBytes,
        progress: uploadProgress(uploadedBytes, file.size),
        ...extra,
      }));
    };

    try {
      applyProgress({ status: 'uploading', message: undefined });
      throwIfCancelled();

      const resumeRecord = getResumeRecord(resumeKey);
      if (resumeRecord?.uploadId && resumeRecord.path === targetPath && resumeRecord.size === file.size) {
        try {
          const session = await clientApiFetch<UploadSessionInfo>(`/api/uploads/${resumeRecord.uploadId}`);
          const resumable = session.status === 'pending' || session.status === 'uploading';
          const sameFile = session.path === targetPath && session.size === file.size;
          if (resumable && sameFile) {
            uploadId = session.id;
            chunkSize =
              session.chunk_size ||
              resumeRecord.chunkSize ||
              resolveAdaptiveUploadChunkSize(file.size, preferredChunkSize);
            for (const chunkIndex of session.received_chunks || []) {
              receivedChunks.add(chunkIndex);
            }
            completedChunks = receivedChunks.size;
            uploadedBytes = calcUploadedBytesByChunks(file.size, chunkSize, receivedChunks);
            applyProgress({ message: completedChunks > 0 ? t('files.uploadResuming') : undefined });
          } else {
            clearResumeRecord(resumeKey);
          }
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) {
            toast.message(t('files.uploadResumeFallback'));
          }
          clearResumeRecord(resumeKey);
        }
      }

      throwIfCancelled();

      if (!uploadId) {
        const initChunkSize = resolveAdaptiveUploadChunkSize(file.size, chunkSize);
        const init = await clientApiFetch<{ upload_id: string; accepted_chunk_size: number }>('/api/uploads/init', {
          method: 'POST',
          body: JSON.stringify({
            path: targetPath,
            size: file.size,
            chunk_size: initChunkSize,
          }),
        });
        uploadId = init.upload_id;
        chunkSize = normalizeUploadChunkSizeForFile(init.accepted_chunk_size || initChunkSize, file.size);
        completedChunks = 0;
        uploadedBytes = 0;
        receivedChunks.clear();
        applyProgress();
      }

      setResumeRecord(resumeKey, {
        uploadId,
        path: targetPath,
        size: file.size,
        chunkSize,
        fileName: file.name,
        lastModified: file.lastModified,
        updatedAt: Date.now(),
      });

      const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
      for (let i = 0; i < totalChunks; i += 1) {
        throwIfCancelled();
        if (receivedChunks.has(i)) continue;

        const chunkBlob = file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize));
        let uploaded = false;
        let lastError: unknown;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          throwIfCancelled();
          const controller = new AbortController();
          activeUploadAbortRef.current.set(taskId, controller);
          try {
            const chunkResp = await fetch(`${apiBase}/api/uploads/${uploadId}/chunk?chunk_index=${i}`, {
              method: 'PUT',
              headers: {
                'content-type': 'application/octet-stream',
              },
              body: chunkBlob,
              credentials: 'include',
              signal: controller.signal,
            });
            if (!chunkResp.ok) {
              const text = (await chunkResp.text()).trim();
              throw new Error(`chunk ${i} upload failed (${chunkResp.status})${text ? `: ${text.slice(0, 300)}` : ''}`);
            }
            uploaded = true;
            break;
          } catch (err) {
            if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
              throw new Error(UPLOAD_CANCELLED_ERROR);
            }
            lastError = err;
            if (attempt < 2) {
              await sleep(500 * (attempt + 1));
            }
          } finally {
            const currentController = activeUploadAbortRef.current.get(taskId);
            if (currentController === controller) {
              activeUploadAbortRef.current.delete(taskId);
            }
          }
        }

        if (!uploaded) {
          if (lastError instanceof Error) throw lastError;
          throw new Error(`chunk ${i} upload failed`);
        }

        receivedChunks.add(i);
        completedChunks = receivedChunks.size;
        uploadedBytes = Math.min(file.size, uploadedBytes + getChunkBytes(file.size, chunkSize, i));
        setResumeRecord(resumeKey, {
          uploadId,
          path: targetPath,
          size: file.size,
          chunkSize,
          fileName: file.name,
          lastModified: file.lastModified,
          updatedAt: Date.now(),
        });
        applyProgress();
      }

      throwIfCancelled();

      await clientApiFetch<{ file_path: string; revision: string | null }>(`/api/uploads/${uploadId}/complete`, {
        method: 'POST',
      });
      clearResumeRecord(resumeKey);

      uploadedBytes = file.size;
      completedChunks = Math.max(completedChunks, Math.ceil(file.size / chunkSize));
      applyProgress({
        status: 'completed',
        message: undefined,
      });

      toast.success(t('files.uploadTaskComplete', { name: file.name }));
      await refetch();
    } catch (err) {
      const cancelled = isCancelledError(err);

      if (uploadId) {
        try {
          const reason = cancelled
            ? 'upload cancelled by user'
            : err instanceof Error
              ? err.message.slice(0, 500)
              : 'upload failed';
          await clientApiFetch(`/api/uploads/${uploadId}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          });
        } catch {
          // Best effort cancellation.
        }
      }

      if (cancelled) {
        clearResumeRecord(resumeKey);
        applyProgress({
          status: 'cancelled',
          message: t('files.uploadCancelled'),
        });
        toast.message(t('files.uploadCancelled'));
      } else {
        const message = errorMessage(err, t('files.unknown'));
        applyProgress({
          status: 'failed',
          message,
        });
        toast.error(t('files.uploadFailedTask', { name: file.name, error: message }));
      }
    } finally {
      activeUploadAbortRef.current.delete(taskId);
      uploadCancelRequestRef.current.delete(taskId);
    }
  }

  const canNext = page < loadedPageCount || !!nextCursor;
  const closePreview = () => setPreviewingFile(null);
  const currentFolderLabel = isSearchMode ? t('files.searchGlobal') : prefix ? displayRepoPath(prefix) : t('files.rootFolder');
  const quickUploadTargetLabel = prefix ? `/${prefix}` : '/';

  return (
    <div
      className="relative space-y-5"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      <div className="flex flex-wrap items-stretch gap-3">
        <StatCard label={t('files.totalFiles')} value={String(totalFiles)} />
        <StatCard label={t('files.totalSize')} value={formatBytes(totalSizeBytes)} />
        {storageRemainingBytes !== null ? (
          <StatCard
            label={t('files.spaceLeft')}
            value={formatBytes(storageRemainingBytes)}
            note={storageCapacityBytes !== null ? t('files.capacity', { capacity: formatBytes(storageCapacityBytes) }) : undefined}
          />
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form className="flex w-full max-w-xl gap-2" onSubmit={onSearch}>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder={t('files.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button disabled={loading} type="submit">
              {t('files.search')}
            </Button>
            {isSearchMode ? (
              <Button type="button" variant="outline" disabled={loading} onClick={clearSearch}>
                <X className="mr-2 h-4 w-4" />
                {t('files.clearSearch')}
              </Button>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={loading} onClick={refreshNow}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('files.refresh')}
            </Button>

            <CreateFolderDialog
              open={createFolderDialogOpen}
              onOpenChange={setCreateFolderDialogOpen}
              currentPrefix={prefix}
              onCreate={queueCreateFolder}
            />

            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="border-zinc-900 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 focus-visible:ring-zinc-400 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-600">
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {t('files.upload')}
                </Button>
              </DialogTrigger>
              <DialogContent className="gap-0 overflow-hidden border-zinc-300 bg-zinc-50 p-0 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:max-w-3xl">
                <DialogHeader className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
                  <DialogTitle className="flex items-center gap-2">
                    <UploadCloud className="h-5 w-5" />
                    {t('files.uploadTitle')}
                  </DialogTitle>
                  <DialogDescription className="text-zinc-600 dark:text-zinc-400">{t('files.uploadDesc')}</DialogDescription>
                </DialogHeader>
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto bg-zinc-50 px-6 py-5 dark:bg-zinc-900">
                  <UploadPanel basePrefix={prefix} onQueueUploads={queueUploads} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          {prefix ? (
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={goToParentFolder}
              aria-label={t('files.goParent')}
              title={t('files.goParent')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {t('files.currentFolder', { path: currentFolderLabel })}
          </span>
          <AnimatePresence initial={false}>
            {selectedCount > 0 ? (
              <motion.span
                key="files-selected-count"
                initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="text-sm text-muted-foreground"
              >
                {t('files.selectedCount', { count: selectedCount })}
              </motion.span>
            ) : null}
          </AnimatePresence>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPagePaths.length === 0 || allCurrentPageSelected}
            onClick={() => toggleCurrentPageSelection(true)}
          >
            {t('files.selectPage')}
          </Button>
          <Button size="sm" variant="outline" disabled={selectedCount === 0} onClick={clearSelection}>
            {t('files.clearSelection')}
          </Button>
          <AnimatePresence initial={false}>
            {selectedCount > 0 ? (
              <motion.div
                key="files-batch-delete"
                initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <BatchDeleteDialog selectedPaths={selectedOrderedPaths} displayPaths={selectedDisplayPaths} onDelete={deleteSelectedFiles} />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="ml-auto">
            <FileViewModeToggle viewMode={viewMode} onChange={setViewMode} reduceMotion={reduceMotion} t={t} />
          </div>
        </div>
      </div>

      <FileEntriesPanel
        entries={currentPageEntries}
        viewMode={viewMode}
        reduceMotion={reduceMotion}
        t={t}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onToggleSort={toggleSort}
        currentPagePaths={currentPagePaths}
        currentPageCheckState={currentPageCheckState}
        selectedPaths={selectedPaths}
        isSearchMode={isSearchMode}
        apiBase={apiBase}
        shiftSelectionRef={shiftSelectionRef}
        onToggleCurrentPageSelection={toggleCurrentPageSelection}
        onOpenFolder={openFolder}
        onSetPreviewingFile={setPreviewingFile}
        onUpdatePathSelection={updatePathSelection}
        onCreateLink={createLink}
        onRenameFile={renameFile}
        onDeleteFile={deleteFile}
        onDeleteFolder={(path) => deleteFile(path, { recursive: true })}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <PageSizeSelect value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={handlePageSizeChange} />
        <PaginationNav page={page} totalPages={displayPageCount} onPageChange={goToPage} canNext={canNext} canPrev={page > 1} />
      </div>

      <FilePreviewDialog
        apiBase={apiBase}
        item={previewingFile}
        open={!!previewingFile}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      />

      <UploadCenter
        tasks={uploadTasks}
        summary={uploadSummary}
        expanded={uploadCenterExpanded}
        onExpandedChange={setUploadCenterExpanded}
        onCancelTask={requestCancelUploadTask}
        onRetryTask={retryUploadTask}
        onClearFailed={clearFailedUploadTasks}
      />

      <AnimatePresence>
        {pageDropActive ? (
          <motion.div
            key="files-page-drop-overlay"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.16 }}
            className="pointer-events-none absolute inset-0 z-40 rounded-xl border-2 border-dashed border-zinc-400 bg-zinc-100/88 p-6 dark:border-zinc-600 dark:bg-zinc-950/88"
          >
            <div className="mx-auto mt-16 max-w-xl rounded-lg border border-zinc-300 bg-zinc-50/95 px-5 py-4 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {pageDropParsing ? t('files.uploadPreparingSelection') : t('files.uploadDropQuickTitle')}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                {t('files.uploadDropQuickHint', { path: quickUploadTargetLabel })}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
