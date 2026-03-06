import type { DownloadMode, HFRepoType } from '@/lib/types';

export const HF_REPO_TYPES: HFRepoType[] = ['dataset', 'model', 'space'];
export const DOWNLOAD_MODES: DownloadMode[] = ['auto', 'proxy', 'redirect'];
export const PASSWORD_MIN_LENGTH = 8;
export const LOGIN_PERSISTENCE_TTL_HOURS_MIN = 1;
export const LOGIN_PERSISTENCE_TTL_HOURS_MAX = 14 * 24;
