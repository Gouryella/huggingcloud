import type { FileItem } from '@/lib/types';

import {
  ADAPTIVE_UPLOAD_SINGLE_CHUNK_CAP,
  ADAPTIVE_UPLOAD_TARGET_CHUNKS,
  AUDIO_EXTENSIONS,
  DEFAULT_HIDDEN_FILE_NAMES,
  FALLBACK_UPLOAD_CHUNK_SIZE,
  FOLDER_MARKER_FILE_NAME,
  IMAGE_EXTENSIONS,
  MAX_UPLOAD_CHUNK_SIZE,
  MIN_UPLOAD_CHUNK_SIZE,
  TEXT_EXTENSIONS,
  UPLOAD_RESUME_STORAGE_KEY,
  VIDEO_EXTENSIONS,
} from './constants';
import type {
  DataTransferItemWithWebkitEntry,
  PreviewKind,
  TranslateFn,
  UploadQueueItem,
  UploadResumeRecord,
  UploadSelectionItem,
  UploadTaskStatus,
  WebkitFileSystemDirectoryEntry,
  WebkitFileSystemDirectoryReader,
  WebkitFileSystemEntry,
  WebkitFileSystemFileEntry,
} from './types';

function isImage(mime?: string | null) {
  return !!mime && mime.startsWith('image/');
}

function isVideo(mime?: string | null) {
  return !!mime && mime.startsWith('video/');
}

function fileExtension(path: string) {
  const normalizedPath = path.toLowerCase();
  const lastDot = normalizedPath.lastIndexOf('.');
  if (lastDot < 0 || lastDot === normalizedPath.length - 1) {
    return '';
  }
  return normalizedPath.slice(lastDot + 1);
}

function isTextLikeMime(mime?: string | null) {
  if (!mime) return false;
  return (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript') ||
    mime.includes('x-sh') ||
    mime.includes('yaml')
  );
}

export function previewKindForFile(item: FileItem): PreviewKind {
  const mime = item.mime?.toLowerCase();
  const ext = fileExtension(item.path);

  if (isImage(mime)) return 'image';
  if (isVideo(mime)) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (isTextLikeMime(mime)) return 'text';

  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';

  return 'binary';
}

export function encodeRepoPath(path: string) {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function resolveDefaultUploadChunkSize() {
  const raw = process.env.NEXT_PUBLIC_UPLOAD_CHUNK_SIZE_BYTES;
  if (!raw) return FALLBACK_UPLOAD_CHUNK_SIZE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return FALLBACK_UPLOAD_CHUNK_SIZE;
  const normalized = Math.floor(parsed);
  return Math.min(MAX_UPLOAD_CHUNK_SIZE, Math.max(MIN_UPLOAD_CHUNK_SIZE, normalized));
}

export const DEFAULT_UPLOAD_CHUNK_SIZE = resolveDefaultUploadChunkSize();

export function normalizeUploadChunkSize(rawChunkSize: number) {
  if (!Number.isFinite(rawChunkSize)) return DEFAULT_UPLOAD_CHUNK_SIZE;
  const aligned = Math.ceil(rawChunkSize / MIN_UPLOAD_CHUNK_SIZE) * MIN_UPLOAD_CHUNK_SIZE;
  return Math.min(MAX_UPLOAD_CHUNK_SIZE, Math.max(MIN_UPLOAD_CHUNK_SIZE, aligned));
}

export function normalizeUploadChunkSizeForFile(rawChunkSize: number, fileSize: number) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return normalizeUploadChunkSize(rawChunkSize);

  const maxChunkForFile = Math.min(MAX_UPLOAD_CHUNK_SIZE, Math.floor(fileSize));
  if (maxChunkForFile <= 0) return MIN_UPLOAD_CHUNK_SIZE;
  if (maxChunkForFile <= MIN_UPLOAD_CHUNK_SIZE) return maxChunkForFile;

  return Math.min(maxChunkForFile, normalizeUploadChunkSize(rawChunkSize));
}

export function resolveAdaptiveUploadChunkSize(fileSize: number, fallbackChunkSize = DEFAULT_UPLOAD_CHUNK_SIZE) {
  const fallback = normalizeUploadChunkSizeForFile(fallbackChunkSize, fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0) return fallback;

  // Small files should complete in a single request to avoid pointless chunk metadata.
  const singleChunkThreshold = Math.min(fallback, ADAPTIVE_UPLOAD_SINGLE_CHUNK_CAP);
  if (fileSize <= singleChunkThreshold) return fileSize;

  // Keep request counts bounded for large files while still honoring preferred chunk size.
  const targetBasedChunkSize = fileSize / ADAPTIVE_UPLOAD_TARGET_CHUNKS;
  const adaptiveFloor = Math.max(fileSize <= MIN_UPLOAD_CHUNK_SIZE ? fileSize : MIN_UPLOAD_CHUNK_SIZE, fallback);
  return normalizeUploadChunkSizeForFile(Math.max(targetBasedChunkSize, adaptiveFloor), fileSize);
}

export function buildPreviewUrl(apiBase: string, path: string) {
  const base = (apiBase || '').replace(/\/+$/, '');
  const relativePath = `/dl/${encodeRepoPath(path)}?inline=true`;
  return base ? `${base}${relativePath}` : relativePath;
}

export function fileUploadedAt(item: FileItem) {
  return item.last_modified || item.indexed_at || null;
}

export function fileNameFromPath(path: string) {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function isFolderMarkerPath(path: string) {
  return fileNameFromPath(path) === FOLDER_MARKER_FILE_NAME;
}

export function isDefaultHiddenFilePath(path: string) {
  return DEFAULT_HIDDEN_FILE_NAMES.has(fileNameFromPath(path));
}

export function relativePathToPrefix(fullPath: string, prefix: string) {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  if (!normalizedPrefix) return fullPath;
  if (fullPath === normalizedPrefix) return '';
  if (fullPath.startsWith(`${normalizedPrefix}/`)) return fullPath.slice(normalizedPrefix.length + 1);
  return null;
}

export function buildFilesRoute(prefix: string) {
  return prefix ? `/files/${encodeRepoPath(prefix)}` : '/files';
}

export function parentPath(path: string) {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash < 0) return '';
  return path.slice(0, lastSlash);
}

export function buildRenameDestination(path: string, nextName: string) {
  const parent = parentPath(path);
  return parent ? `${parent}/${nextName}` : nextName;
}

export function parseDateToMillis(value: string | null) {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

export function normalizeUploadPath(basePrefix: string, inputPath: string, fileName: string) {
  const normalizedBase = basePrefix.replace(/^\/+|\/+$/g, '');
  const raw = inputPath.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\/+$/, '');

  if (!raw) {
    return normalizedBase ? `${normalizedBase}/${fileName}` : fileName;
  }

  if (normalizedBase && (raw === normalizedBase || raw.startsWith(`${normalizedBase}/`))) {
    return raw;
  }

  if (normalizedBase) {
    return `${normalizedBase}/${raw}`;
  }

  return raw;
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function buildUploadResumeKey(file: File, path: string) {
  return `${path}::${file.name}::${file.size}::${file.lastModified}`;
}

export function getChunkBytes(size: number, chunkSize: number, chunkIndex: number) {
  const start = chunkIndex * chunkSize;
  const end = Math.min(size, start + chunkSize);
  return Math.max(0, end - start);
}

function readResumeRecordMap() {
  if (typeof window === 'undefined') return {} as Record<string, UploadResumeRecord>;
  try {
    const raw = window.localStorage.getItem(UPLOAD_RESUME_STORAGE_KEY);
    if (!raw) return {} as Record<string, UploadResumeRecord>;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {} as Record<string, UploadResumeRecord>;
    return parsed as Record<string, UploadResumeRecord>;
  } catch {
    return {} as Record<string, UploadResumeRecord>;
  }
}

export function getResumeRecord(key: string) {
  const map = readResumeRecordMap();
  return map[key];
}

export function setResumeRecord(key: string, record: UploadResumeRecord) {
  if (typeof window === 'undefined') return;
  const map = readResumeRecordMap();
  map[key] = record;
  window.localStorage.setItem(UPLOAD_RESUME_STORAGE_KEY, JSON.stringify(map));
}

export function clearResumeRecord(key: string) {
  if (typeof window === 'undefined') return;
  const map = readResumeRecordMap();
  if (!map[key]) return;
  delete map[key];
  window.localStorage.setItem(UPLOAD_RESUME_STORAGE_KEY, JSON.stringify(map));
}

export function buildUploadTaskId() {
  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function calcUploadedBytesByChunks(size: number, chunkSize: number, chunks: Iterable<number>) {
  let total = 0;
  for (const chunkIndex of chunks) {
    total += getChunkBytes(size, chunkSize, chunkIndex);
  }
  return total;
}

export function uploadProgress(uploadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
}

export function isTaskActive(status: UploadTaskStatus) {
  return status === 'uploading' || status === 'cancelling';
}

export function uploadTaskStatusLabel(t: TranslateFn, status: UploadTaskStatus) {
  switch (status) {
    case 'uploading':
      return t('files.uploadTaskUploading');
    case 'failed':
      return t('files.uploadTaskFailed');
    case 'completed':
      return t('files.uploadTaskCompleted');
    case 'cancelling':
      return t('files.uploadTaskCancelling');
    case 'cancelled':
    default:
      return t('files.uploadTaskCancelled');
  }
}

export function hasDragFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types || []).includes('Files');
}

export function normalizeRelativePath(rawPath: string) {
  return rawPath
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function isFileSystemDirectoryEntry(entry: WebkitFileSystemEntry): entry is WebkitFileSystemDirectoryEntry {
  return entry.isDirectory === true;
}

function isFileSystemFileEntry(entry: WebkitFileSystemEntry): entry is WebkitFileSystemFileEntry {
  return entry.isFile === true;
}

function readFileSystemFile(entry: WebkitFileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readAllDirectoryEntries(reader: WebkitFileSystemDirectoryReader) {
  const allEntries: WebkitFileSystemEntry[] = [];
  while (true) {
    const chunk = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (chunk.length === 0) {
      break;
    }
    allEntries.push(...chunk);
  }
  return allEntries;
}

async function collectDroppedItemsFromEntry(
  entry: WebkitFileSystemEntry,
  parentPath: string,
  collector: UploadSelectionItem[],
) {
  if (isFileSystemFileEntry(entry)) {
    const file = await readFileSystemFile(entry);
    const relativePath = normalizeRelativePath(parentPath ? `${parentPath}/${entry.name}` : entry.name) || file.name;
    collector.push({
      file,
      relativePath,
    });
    return;
  }

  if (isFileSystemDirectoryEntry(entry)) {
    const nextParent = normalizeRelativePath(parentPath ? `${parentPath}/${entry.name}` : entry.name);
    const entries = await readAllDirectoryEntries(entry.createReader());
    for (const childEntry of entries) {
      await collectDroppedItemsFromEntry(childEntry, nextParent, collector);
    }
  }
}

export async function extractSelectionItemsFromTransfer(dataTransfer: DataTransfer) {
  const collectedFromEntries: UploadSelectionItem[] = [];
  const dtItems = Array.from(dataTransfer.items || []);

  // Snapshot file payloads before any async awaits. Some browsers expose less data
  // after async boundaries during drag-and-drop handling.
  const fallbackItems: UploadSelectionItem[] = Array.from(dataTransfer.files || []).map((file) => {
    const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const relativePath = normalizeRelativePath(webkitRelativePath || file.name) || file.name;
    return {
      file,
      relativePath,
    };
  });

  const directItemsFromDataTransferItems: UploadSelectionItem[] = dtItems
    .filter((dtItem) => dtItem.kind === 'file')
    .map((dtItem) => dtItem.getAsFile())
    .filter((file): file is File => file !== null)
    .map((file) => {
      const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const relativePath = normalizeRelativePath(webkitRelativePath || file.name) || file.name;
      return {
        file,
        relativePath,
      };
    });

  let usedWebkitEntryApi = false;
  let sawDirectoryEntry = false;

  for (const dtItem of dtItems) {
    if (dtItem.kind !== 'file') continue;
    const webkitEntry = (dtItem as DataTransferItemWithWebkitEntry).webkitGetAsEntry?.() || null;
    if (!webkitEntry) continue;
    usedWebkitEntryApi = true;
    if (isFileSystemDirectoryEntry(webkitEntry)) {
      sawDirectoryEntry = true;
    }
    await collectDroppedItemsFromEntry(webkitEntry, '', collectedFromEntries);
  }

  const sourceItems = sawDirectoryEntry
    ? [
        // Keep directory-relative paths from entry traversal first.
        ...collectedFromEntries,
        ...fallbackItems,
        ...directItemsFromDataTransferItems,
      ]
    : [
        // For plain file drags, merge all sources to avoid browser-specific omissions.
        ...fallbackItems,
        ...directItemsFromDataTransferItems,
        ...(usedWebkitEntryApi ? collectedFromEntries : []),
      ];
  const unique = new Map<string, UploadSelectionItem>();
  for (const item of sourceItems) {
    const key = `${item.relativePath}::${item.file.size}::${item.file.lastModified}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }
  const dedupedItems = Array.from(unique.values());

  const richestSource = [sourceItems, fallbackItems, directItemsFromDataTransferItems, collectedFromEntries].reduce<
    UploadSelectionItem[]
  >((best, items) => (items.length > best.length ? items : best), []);

  if (dedupedItems.length < richestSource.length) {
    return richestSource;
  }

  return dedupedItems;
}

export function buildQueueItemsForUpload(items: UploadSelectionItem[], pathInput: string, basePrefix: string): UploadQueueItem[] {
  const prefixInput = pathInput.trim().replace(/^\/+/, '').replace(/\/+$/, '');

  return items.map(({ file, relativePath }) => {
    const isSingleFlatFile = items.length === 1 && relativePath === file.name;
    const inputPath = isSingleFlatFile
      ? prefixInput || file.name
      : prefixInput
        ? `${prefixInput}/${relativePath}`
        : relativePath;

    return {
      file,
      targetPath: normalizeUploadPath(basePrefix, inputPath, file.name),
    };
  });
}

export function validateSimpleName(input: string): 'empty' | 'invalid' | null {
  const normalized = input.trim();
  if (!normalized) return 'empty';
  if (normalized.includes('/') || normalized.includes('\\')) return 'invalid';
  return null;
}
