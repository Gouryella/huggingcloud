export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const FILE_LIST_FETCH_LIMIT = 500;
export const MIN_UPLOAD_CHUNK_SIZE = 256 * 1024;
export const MAX_UPLOAD_CHUNK_SIZE = 64 * 1024 * 1024;
export const FALLBACK_UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;
export const ADAPTIVE_UPLOAD_TARGET_CHUNKS = 192;
export const ADAPTIVE_UPLOAD_SINGLE_CHUNK_CAP = 8 * 1024 * 1024;
export const FINISHED_UPLOAD_AUTO_CLEAR_DELAY_MS = 800;
export const PREVIEW_TEXT_BYTE_LIMIT = 256 * 1024;
export const UPLOAD_RESUME_STORAGE_KEY = 'hf.upload.resume.v1';
export const UPLOAD_CANCELLED_ERROR = '__UPLOAD_CANCELLED__';
export const FOLDER_MARKER_FILE_NAME = '.__hf_folder__.keep';
export const DEFAULT_HIDDEN_FILE_NAMES = new Set(['.gitattributes']);

export const ZINC_CHECKBOX_CLASS =
  'border-zinc-400 focus-visible:ring-zinc-400 dark:border-zinc-600 dark:focus-visible:ring-zinc-600 data-[state=checked]:border-zinc-900 data-[state=checked]:bg-zinc-900 data-[state=checked]:text-zinc-50 dark:data-[state=checked]:border-zinc-100 dark:data-[state=checked]:bg-zinc-100 dark:data-[state=checked]:text-zinc-900 data-[state=indeterminate]:border-zinc-900 data-[state=indeterminate]:bg-zinc-900 data-[state=indeterminate]:text-zinc-50 dark:data-[state=indeterminate]:border-zinc-100 dark:data-[state=indeterminate]:bg-zinc-100 dark:data-[state=indeterminate]:text-zinc-900';

export const MIME_BADGE_CLASS = 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';

export const IMAGE_EXTENSIONS = new Set(['apng', 'avif', 'bmp', 'gif', 'heic', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
export const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'ogv', 'webm']);
export const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'wav', 'webm']);
export const TEXT_EXTENSIONS = new Set([
  'c',
  'cpp',
  'css',
  'csv',
  'go',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'md',
  'mjs',
  'py',
  'rb',
  'rs',
  'sh',
  'sql',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
]);
