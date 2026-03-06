'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function sanitizePageSize(value: number, options: number[], fallback: number): number {
  if (Number.isFinite(value) && options.includes(value)) {
    return value;
  }
  return fallback;
}

export function usePersistedPageSize(storageKey: string, defaultSize: number, options: number[]) {
  const safeDefault = sanitizePageSize(defaultSize, options, options[0] ?? 12);
  const [pageSize, setPageSize] = useState(safeDefault);

  const optionKey = useMemo(() => options.join(','), [options]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = Number(raw);
    const next = sanitizePageSize(parsed, options, safeDefault);
    setPageSize(next);
  }, [storageKey, optionKey, options, safeDefault]);

  const updatePageSize = useCallback(
    (nextSize: number) => {
      const next = sanitizePageSize(nextSize, options, safeDefault);
      setPageSize(next);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, String(next));
      }
    },
    [storageKey, options, safeDefault],
  );

  return { pageSize, setPageSize: updatePageSize };
}
