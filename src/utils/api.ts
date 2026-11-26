import { BillingStatus } from '../types/creator';

const RUNTIME_API_STORAGE_KEY = 'viralflow_api_base_url_v1';

export function normalizeApiBaseUrl(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const withProtocol =
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    const cleanPath = parsed.pathname
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');
    return cleanPath === '/' || !cleanPath
      ? parsed.origin
      : `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

const ENV_API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL as string | undefined
);

function readInitialRuntimeApiUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeApiBaseUrl(params.get('api'));
    if (fromQuery) {
      window.localStorage.setItem(RUNTIME_API_STORAGE_KEY, fromQuery);
      params.delete('api');
      const remaining = params.toString();
      const nextUrl = `${window.location.pathname}${
        remaining ? `?${remaining}` : ''
      }${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);
      return fromQuery;
    }
    return normalizeApiBaseUrl(
      window.localStorage.getItem(RUNTIME_API_STORAGE_KEY)
    );
  } catch {
    return '';
  }
}

let runtimeApiBaseUrl: string = readInitialRuntimeApiUrl();

export function getApiBaseUrl(): string {
  return ENV_API_BASE_URL || runtimeApiBaseUrl;
}

export function setRuntimeApiBaseUrl(rawUrl: string): string {
  const normalized = normalizeApiBaseUrl(rawUrl);
  if (!normalized) {
    throw new Error(
      'Enter a valid backend URL starting with https:// (for example https://your-backend.onrender.com).'
    );
  }
  runtimeApiBaseUrl = normalized;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RUNTIME_API_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage failures
    }
  }
  return normalized;
}

export function clearRuntimeApiBaseUrl() {
  runtimeApiBaseUrl = '';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(RUNTIME_API_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
  }
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

let inMemoryWorkspaceToken: string | null = null;

export function setWorkspaceToken(token: string | null | undefined) {
  if (token && typeof token === 'string') {
    inMemoryWorkspaceToken = token;
  }
}

export function getAuthHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'ViralFlow',
    ...(extra || {}),
  };
  if (inMemoryWorkspaceToken) {
    headers.Authorization = `Bearer ${inMemoryWorkspaceToken}`;
  }
  return headers;
}

export async function verifyBackendHealth(
  candidateUrl?: string
): Promise<string> {
  const base = candidateUrl
    ? normalizeApiBaseUrl(candidateUrl)
    : getApiBaseUrl();

  if (candidateUrl && !base) {
    throw new Error(
      'Enter a valid backend URL starting with https:// (for example https://your-backend.onrender.com).'
    );
  }

  const target = base ? `${base}/api/health` : '/api/health';

  let res: Response;
  try {
    res = await fetch(target, {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Requested-With': 'ViralFlow' },
    });
  } catch {
    throw new Error(
      base
        ? `Could not reach ${target}. Check that the backend is live and CORS_ORIGIN allows ${window.location.origin}.`
        : 'Could not reach the backend server on this host.'
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      base
        ? `${target} returned HTML instead of JSON. Confirm that URL points to your deployed Node server.`
        : 'This host only serves static files. Connect your deployed Node backend URL below.'
    );
  }

  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    service?: string;
  } | null;

  if (!res.ok || !payload?.ok) {
    throw new Error(
      `Backend health check returned HTTP ${res.status}. Verify the Node server is running.`
    );
  }

  if (base) {
    setRuntimeApiBaseUrl(base);
  }
  return base;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const extraHeaders: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        extraHeaders[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        extraHeaders[key] = value;
      }
    } else {
      Object.assign(extraHeaders, init.headers);
    }
  }

  const base = getApiBaseUrl();
  try {
    return await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: getAuthHeaders(extraHeaders),
    });
  } catch {
    const targetHint = base
      ? `Check that ${base}/api/health is reachable and CORS_ORIGIN allows this domain.`
      : 'Connect your deployed Node backend URL below or set VITE_API_BASE_URL for the frontend.';
    throw new ApiRequestError(
      `Unable to reach the backend server. ${targetHint}`,
      503
    );
  }
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  billing?: BillingStatus;

  constructor(
    message: string,
    status: number,
    code?: string,
    billing?: BillingStatus
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.billing = billing;
  }
}

export async function parseApiJson<T>(
  res: Response,
  fallbackError: string
): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const base = getApiBaseUrl();
  if (!contentType.includes('application/json')) {
    const targetHint = base
      ? `Verify ${base}/api/health responds with JSON.`
      : 'Deploy the Node backend and connect its URL below (or set VITE_API_BASE_URL).';
    throw new ApiRequestError(
      `The backend API server is not running on this host. ${targetHint}`,
      res.status || 503
    );
  }
  const data = await res.json();
  if (data && typeof data === 'object' && data.billing?.token) {
    setWorkspaceToken(data.billing.token);
  }
  if (!res.ok) {
    throw new ApiRequestError(
      (data && data.error) || fallbackError,
      res.status,
      data && typeof data.code === 'string' ? data.code : undefined,
      data && data.billing ? (data.billing as BillingStatus) : undefined
    );
  }
  return data as T;
}

const STATIC_BILLING_STORAGE_KEY = 'viralflow_static_billing_v1';

export function getStaticFallbackBilling(): BillingStatus {
  const defaultWorkspaceId = 'static-local-workspace';
  if (typeof window === 'undefined') {
    return {
      workspaceId: defaultWorkspaceId,
      isSubscribed: false,
      planStatus: 'inactive',
      freeLimit: 3,
      freeUsed: 0,
      freeRemaining: 3,
      canUseApp: true,
      customerEmail: null,
    };
  }
  try {
    const raw = window.localStorage.getItem(STATIC_BILLING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BillingStatus>;
      const freeLimit = 3;
      const freeUsed = Math.min(freeLimit, Math.max(0, Number(parsed.freeUsed) || 0));
      const isSubscribed = Boolean(parsed.isSubscribed);
      const freeRemaining = isSubscribed ? freeLimit : Math.max(0, freeLimit - freeUsed);
      return {
        workspaceId: parsed.workspaceId || crypto.randomUUID(),
        isSubscribed,
        planStatus: isSubscribed ? 'active' : parsed.planStatus || 'inactive',
        freeLimit,
        freeUsed,
        freeRemaining,
        canUseApp: isSubscribed || freeRemaining > 0,
        customerEmail: parsed.customerEmail ?? null,
        lastTransactionId: parsed.lastTransactionId ?? null,
      };
    }
    const initial: BillingStatus = {
      workspaceId: crypto.randomUUID(),
      isSubscribed: false,
      planStatus: 'inactive',
      freeLimit: 3,
      freeUsed: 0,
      freeRemaining: 3,
      canUseApp: true,
      customerEmail: null,
    };
    window.localStorage.setItem(STATIC_BILLING_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  } catch {
    return {
      workspaceId: defaultWorkspaceId,
      isSubscribed: false,
      planStatus: 'inactive',
      freeLimit: 3,
      freeUsed: 0,
      freeRemaining: 3,
      canUseApp: true,
      customerEmail: null,
    };
  }
}

export function saveStaticFallbackBilling(
  patch: Partial<BillingStatus>
): BillingStatus {
  const current = getStaticFallbackBilling();
  const freeLimit = 3;
  const freeUsed =
    patch.freeUsed !== undefined
      ? Math.min(freeLimit, Math.max(0, patch.freeUsed))
      : current.freeUsed;
  const isSubscribed =
    patch.isSubscribed !== undefined ? patch.isSubscribed : current.isSubscribed;
  const freeRemaining = isSubscribed ? freeLimit : Math.max(0, freeLimit - freeUsed);
  const next: BillingStatus = {
    ...current,
    ...patch,
    freeLimit,
    freeUsed,
    freeRemaining,
    isSubscribed,
    canUseApp: isSubscribed || freeRemaining > 0,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STATIC_BILLING_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures
    }
  }
  return next;
}

