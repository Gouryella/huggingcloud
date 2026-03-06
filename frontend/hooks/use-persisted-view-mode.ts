'use client';

import { useCallback, useEffect, useState } from 'react';

type ViewMode = 'table' | 'preview';

function sanitizeViewMode(value: string | null, fallback: ViewMode): ViewMode {
  return value === 'preview' || value === 'table' ? value : fallback;
}

export function usePersistedViewMode(storageKey: string, defaultMode: ViewMode) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    setViewMode(sanitizeViewMode(raw, defaultMode));
  }, [storageKey, defaultMode]);

  const updateViewMode = useCallback(
    (nextMode: ViewMode) => {
      const safeMode = sanitizeViewMode(nextMode, defaultMode);
      setViewMode(safeMode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, safeMode);
      }
    },
    [storageKey, defaultMode],
  );

  return { viewMode, setViewMode: updateViewMode };
}
