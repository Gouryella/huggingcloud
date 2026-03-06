import type { FileItem } from '@/lib/types';

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'binary';
export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;
export type FileSortKey = 'name' | 'size' | 'uploaded' | 'mime';
export type SortDirection = 'asc' | 'desc';

export type UploadTaskStatus = 'uploading' | 'failed' | 'completed' | 'cancelling' | 'cancelled';

export type UploadTask = {
  id: string;
  file: File;
  path: string;
  fileName: string;
  size: number;
  uploadedBytes: number;
  progress: number;
  status: UploadTaskStatus;
  message?: string;
  uploadId?: string;
  chunkSize: number;
  completedChunks: number;
  totalChunks: number;
  resumeKey: string;
  createdAt: number;
};

export type UploadResumeRecord = {
  uploadId: string;
  path: string;
  size: number;
  chunkSize: number;
  fileName: string;
  lastModified: number;
  updatedAt: number;
};

export type UploadQueueItem = {
  file: File;
  targetPath: string;
};

export type UploadSelectionItem = {
  file: File;
  relativePath: string;
};

export type UploadSummary = {
  totalProgress: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalBytes: number;
  uploadedBytes: number;
};

export type WebkitFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

export type WebkitFileSystemFileEntry = WebkitFileSystemEntry & {
  isFile: true;
  file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void;
};

export type WebkitFileSystemDirectoryReader = {
  readEntries: (successCallback: (entries: WebkitFileSystemEntry[]) => void, errorCallback?: (error: DOMException) => void) => void;
};

export type WebkitFileSystemDirectoryEntry = WebkitFileSystemEntry & {
  isDirectory: true;
  createReader: () => WebkitFileSystemDirectoryReader;
};

export type DataTransferItemWithWebkitEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};

export type FolderEntry = {
  kind: 'folder';
  path: string;
  name: string;
  totalSizeBytes: number;
  fileCount: number;
  latestModified: string | null;
};

export type FileEntry = {
  kind: 'file';
  file: FileItem;
};

export type BrowserEntry = FolderEntry | FileEntry;
