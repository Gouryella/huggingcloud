const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_BASE_URL || 'http://localhost:8000';
const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeBase(base: string | undefined): string | null {
  if (!base) return null;
  const trimmed = base.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    let consumed = false;
    try {
      const body = await res.json();
      consumed = true;
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      // Ignore parse error.
    }
    if (!consumed) {
      try {
        const text = (await res.text()).trim();
        if (text) {
          detail = `${detail}: ${text.slice(0, 300)}`;
        }
      } catch {
        // Ignore parse error.
      }
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

export async function serverApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join('; ');

  const headers = new Headers(init?.headers || {});
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }

  const candidates = Array.from(
    new Set([
      normalizeBase(process.env.INTERNAL_API_BASE_URL),
      normalizeBase(process.env.NEXT_PUBLIC_API_BASE_URL),
      normalizeBase(INTERNAL_API_BASE_URL),
      'http://localhost:8000'
    ].filter(Boolean) as string[])
  );

  let lastError: unknown;
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers,
        cache: 'no-store'
      });
      return await parseResponse<T>(res);
    } catch (err) {
      // Network-level errors (e.g. backend not reachable) should try next candidate.
      if (err instanceof TypeError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Backend unreachable. Tried: ${candidates.join(', ')}. Set INTERNAL_API_BASE_URL in frontend/.env.local if needed. Last error: ${String(lastError)}`
  );
}

export async function clientApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {})
    },
    credentials: 'include'
  });

  return parseResponse<T>(res);
}
