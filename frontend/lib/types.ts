export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface UserMe {
  id: string;
  email?: string | null;
  username?: string | null;
  avatar_emoji?: string | null;
  role: UserRole;
  is_active: boolean;
  is_bootstrap: boolean;
  force_root_admin_setup: boolean;
  created_at: string;
}

export interface FileItem {
  path: string;
  size?: number | null;
  mime?: string | null;
  etag?: string | null;
  sha256?: string | null;
  last_modified?: string | null;
  indexed_at?: string | null;
}

export interface FileListResponse {
  items: FileItem[];
  next_cursor?: string | null;
  total_files: number;
  total_size_bytes: number;
  storage_capacity_bytes?: number | null;
  storage_remaining_bytes?: number | null;
  hf_repo_configured?: boolean;
}

export interface LinkRecord {
  id: string;
  path: string;
  short_url?: string | null;
  expires_at: string;
  revoked_at?: string | null;
  max_downloads?: number | null;
  download_count: number;
  one_time: boolean;
  ip_allowlist?: string[] | null;
  speed_limit_mbps?: number | null;
  created_at: string;
}

export interface UploadSessionInfo {
  id: string;
  user_id: string;
  path: string;
  size: number;
  chunk_size: number;
  sha256?: string | null;
  status: 'pending' | 'uploading' | 'committing' | 'completed' | 'failed';
  received_chunks: number[];
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface AuditEntry {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  action: string;
  resource: string;
  metadata_json?: Record<string, unknown> | null;
  ip?: string | null;
  created_at: string;
}

export interface AuditListResponse {
  items: AuditEntry[];
  next_cursor?: string | null;
}

export type HFRepoType = 'dataset' | 'model' | 'space';
export type DownloadMode = 'auto' | 'proxy' | 'redirect';

export interface SystemHFSettings {
  hf_repo_id: string;
  hf_repo_type: HFRepoType;
  hf_revision: string;
  download_mode: DownloadMode;
  has_hf_token: boolean;
  hf_token_masked?: string | null;
}

export interface SystemDomainSettings {
  app_domain: string;
  dl_domain: string;
  use_app_domain_for_dl: boolean;
}

export interface SystemStorageSettings {
  private_storage_capacity_gb: number;
  private_storage_capacity_bytes: number;
}

export interface SystemAuthSettings {
  login_persistence_ttl_hours: number;
  passkey_enabled: boolean;
}

export interface LoginOptions {
  login_persistence_ttl_hours: number;
  passkey_enabled: boolean;
}

export interface PasskeyOptionsResponse {
  challenge_id: string;
  options: Record<string, unknown>;
}

export interface PasskeyCredentialInfo {
  credential_id: string;
  nickname?: string | null;
  transports?: string[] | null;
  created_at: string;
  last_used_at?: string | null;
}
