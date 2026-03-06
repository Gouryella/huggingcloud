'use client';

import { useEffect, useMemo, useState } from 'react';

import { usePersistedPageSize } from '@/hooks/use-persisted-page-size';
import { displayRepoPath } from '@/lib/path-display';
import type { FileItem } from '@/lib/types';

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './constants';
import type { BrowserEntry, FileEntry, FileSortKey, FolderEntry, SortDirection } from './types';
import { fileNameFromPath, fileUploadedAt, isDefaultHiddenFilePath, isFolderMarkerPath, parseDateToMillis, relativePathToPrefix } from './utils';

const DEFAULT_SORT_DIRECTION: Record<FileSortKey, SortDirection> = {
  name: 'asc',
  size: 'desc',
  uploaded: 'desc',
  mime: 'asc',
};

export function useFileBrowserState({
  initialItems,
  initialCursor,
  initialQuery,
  prefix,
}: {
  initialItems: FileItem[];
  initialCursor?: string | null;
  initialQuery?: string;
  prefix: string;
}) {
  const [items, setItems] = useState<FileItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(initialCursor);
  const initialSearchQuery = (initialQuery || '').trim();
  const [query, setQuery] = useState(initialSearchQuery);
  const [appliedQuery, setAppliedQuery] = useState(initialSearchQuery);
  const [sortKey, setSortKey] = useState<FileSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePersistedPageSize('hf.page_size.files', DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS);

  const visibleItems = useMemo(() => items.filter((item) => !isDefaultHiddenFilePath(item.path)), [items]);
  const isSearchMode = appliedQuery.length > 0;

  const { folderEntries, fileEntries } = useMemo(() => {
    if (isSearchMode) {
      return {
        folderEntries: [] as FolderEntry[],
        fileEntries: visibleItems.filter((item) => !isFolderMarkerPath(item.path)),
      };
    }

    const directFiles: FileItem[] = [];
    const folderMap = new Map<string, FolderEntry>();

    for (const item of visibleItems) {
      const relativePath = relativePathToPrefix(item.path, prefix);
      if (relativePath === null || relativePath === '') {
        continue;
      }

      const segments = relativePath.split('/').filter(Boolean);
      if (segments.length === 0) continue;

      const markerFile = isFolderMarkerPath(item.path);
      if (segments.length === 1) {
        if (!markerFile) {
          directFiles.push(item);
        }
        continue;
      }

      const folderName = segments[0];
      const folderPath = prefix ? `${prefix}/${folderName}` : folderName;
      const existing = folderMap.get(folderPath);
      const itemModifiedAt = fileUploadedAt(item);

      if (!existing) {
        folderMap.set(folderPath, {
          kind: 'folder',
          path: folderPath,
          name: folderName,
          totalSizeBytes: markerFile ? 0 : (item.size ?? 0),
          fileCount: markerFile ? 0 : 1,
          latestModified: markerFile ? null : itemModifiedAt,
        });
        continue;
      }

      if (!markerFile) {
        existing.totalSizeBytes += item.size ?? 0;
        existing.fileCount += 1;
        if (parseDateToMillis(itemModifiedAt) > parseDateToMillis(existing.latestModified)) {
          existing.latestModified = itemModifiedAt;
        }
      }
    }

    return {
      folderEntries: Array.from(folderMap.values()),
      fileEntries: directFiles,
    };
  }, [isSearchMode, visibleItems, prefix]);

  const existingFolderPaths = useMemo(() => new Set(folderEntries.map((entry) => entry.path)), [folderEntries]);

  const sortedEntries = useMemo(() => {
    const entries: BrowserEntry[] = [
      ...folderEntries,
      ...fileEntries.map<FileEntry>((file) => ({
        kind: 'file',
        file,
      })),
    ];

    entries.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'folder' ? -1 : 1;
      }

      let result = 0;
      switch (sortKey) {
        case 'size': {
          const aSize = a.kind === 'folder' ? a.totalSizeBytes : (a.file.size ?? -1);
          const bSize = b.kind === 'folder' ? b.totalSizeBytes : (b.file.size ?? -1);
          result = aSize - bSize;
          break;
        }
        case 'uploaded': {
          const aUploadedAt = a.kind === 'folder' ? a.latestModified : fileUploadedAt(a.file);
          const bUploadedAt = b.kind === 'folder' ? b.latestModified : fileUploadedAt(b.file);
          result = parseDateToMillis(aUploadedAt) - parseDateToMillis(bUploadedAt);
          break;
        }
        case 'mime': {
          const aMime = a.kind === 'folder' ? 'folder' : (a.file.mime || '');
          const bMime = b.kind === 'folder' ? 'folder' : (b.file.mime || '');
          result = aMime.localeCompare(bMime, undefined, { sensitivity: 'base' });
          if (result === 0) {
            const aName = a.kind === 'folder' ? a.name : fileNameFromPath(a.file.path);
            const bName = b.kind === 'folder' ? b.name : fileNameFromPath(b.file.path);
            result = aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
          }
          break;
        }
        case 'name':
        default: {
          const aName = a.kind === 'folder' ? a.name : isSearchMode ? a.file.path : fileNameFromPath(a.file.path);
          const bName = b.kind === 'folder' ? b.name : isSearchMode ? b.file.path : fileNameFromPath(b.file.path);
          result = aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
          if (result === 0) {
            const aPath = a.kind === 'folder' ? a.path : a.file.path;
            const bPath = b.kind === 'folder' ? b.path : b.file.path;
            result = aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: 'base' });
          }
          break;
        }
      }

      return sortDirection === 'asc' ? result : -result;
    });
    return entries;
  }, [fileEntries, folderEntries, isSearchMode, sortDirection, sortKey]);

  const loadedPageCount = useMemo(() => Math.max(1, Math.ceil(sortedEntries.length / pageSize)), [sortedEntries.length, pageSize]);
  const displayPageCount = loadedPageCount + (nextCursor ? 1 : 0);

  const currentPageEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedEntries.slice(start, start + pageSize);
  }, [page, sortedEntries, pageSize]);

  const sortedPaths = useMemo(
    () => sortedEntries.filter((entry): entry is FileEntry => entry.kind === 'file').map((entry) => entry.file.path),
    [sortedEntries],
  );

  const currentPagePaths = useMemo(
    () => currentPageEntries.filter((entry): entry is FileEntry => entry.kind === 'file').map((entry) => entry.file.path),
    [currentPageEntries],
  );

  const selectedCount = selectedPaths.size;
  const selectedCurrentPageCount = useMemo(
    () => currentPagePaths.filter((path) => selectedPaths.has(path)).length,
    [currentPagePaths, selectedPaths],
  );

  const allCurrentPageSelected = currentPagePaths.length > 0 && selectedCurrentPageCount === currentPagePaths.length;
  const currentPageCheckState: boolean | 'indeterminate' =
    allCurrentPageSelected ? true : selectedCurrentPageCount > 0 ? 'indeterminate' : false;

  const selectedOrderedPaths = useMemo(() => sortedPaths.filter((path) => selectedPaths.has(path)), [selectedPaths, sortedPaths]);
  const selectedDisplayPaths = useMemo(() => selectedOrderedPaths.map((path) => displayRepoPath(path)), [selectedOrderedPaths]);

  useEffect(() => {
    if (page > displayPageCount) {
      setPage(displayPageCount);
    }
  }, [page, displayPageCount]);

  useEffect(() => {
    const validPaths = new Set(visibleItems.map((item) => item.path));
    setSelectedPaths((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const path of prev) {
        if (validPaths.has(path)) next.add(path);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setSelectionAnchorPath((prev) => (prev && validPaths.has(prev) ? prev : null));
  }, [visibleItems]);

  function handlePageSizeChange(nextSize: number) {
    if (nextSize === pageSize) return;
    setPage(1);
    setPageSize(nextSize);
  }

  function updatePathSelection(path: string, checked: boolean, shiftKey: boolean) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (shiftKey && selectionAnchorPath) {
        const startIndex = sortedPaths.indexOf(selectionAnchorPath);
        const endIndex = sortedPaths.indexOf(path);
        if (startIndex >= 0 && endIndex >= 0) {
          const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          for (let i = from; i <= to; i += 1) {
            const rangePath = sortedPaths[i];
            if (checked) next.add(rangePath);
            else next.delete(rangePath);
          }
          return next;
        }
      }
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
    setSelectionAnchorPath(path);
  }

  function toggleCurrentPageSelection(checked: boolean) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const path of currentPagePaths) {
        if (checked) next.add(path);
        else next.delete(path);
      }
      return next;
    });
    if (currentPagePaths.length > 0) {
      setSelectionAnchorPath(currentPagePaths[0]);
    }
  }

  function clearSelection() {
    setSelectedPaths(new Set());
    setSelectionAnchorPath(null);
  }

  function toggleSort(nextKey: FileSortKey) {
    setPage(1);
    if (sortKey === nextKey) {
      setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(DEFAULT_SORT_DIRECTION[nextKey]);
  }

  return {
    items,
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
    selectionAnchorPath,
    setSelectionAnchorPath,
    selectedCount,
    allCurrentPageSelected,
    currentPageCheckState,
    selectedOrderedPaths,
    selectedDisplayPaths,
    updatePathSelection,
    toggleCurrentPageSelection,
    clearSelection,
  };
}
