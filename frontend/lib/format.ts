const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

function toFiniteNumber(value?: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function formatBytes(size?: number | string | null): string {
  const bytes = toFiniteNumber(size);
  if (bytes === null || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  if (bytes >= TB) return `${(bytes / TB).toFixed(1)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${Math.trunc(bytes)} B`;
}

export function formatCompactNumber(value?: number | string | null, locale = 'en'): string {
  const number = toFiniteNumber(value);
  if (number === null) return '-';

  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: number >= 1000 ? 1 : 0,
  }).format(number);
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
}
