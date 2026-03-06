import { toast } from 'sonner';

import { ApiError } from '@/lib/api';

import { LOGIN_PERSISTENCE_TTL_HOURS_MAX, LOGIN_PERSISTENCE_TTL_HOURS_MIN } from './constants';

export function summarizeCredentialId(credentialId: string): string {
  if (credentialId.length <= 16) return credentialId;
  return `${credentialId.slice(0, 8)}...${credentialId.slice(-8)}`;
}

export function toastApiError(err: unknown, fallbackMessage: string): void {
  if (err instanceof ApiError) {
    toast.error(err.message);
    return;
  }
  toast.error(fallbackMessage);
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function clampLoginPersistenceTTLHours(hours: number): number {
  return Math.min(LOGIN_PERSISTENCE_TTL_HOURS_MAX, Math.max(LOGIN_PERSISTENCE_TTL_HOURS_MIN, hours));
}

export function formatLoginPersistenceTTLDays(hours: number): string {
  const days = hours / 24;
  return Number.isInteger(days) ? String(days) : days.toFixed(1).replace(/\.0$/, '');
}

export function parsePositiveInteger(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}
