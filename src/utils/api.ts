import { BillingStatus } from '../types/creator';

function normalizeApiBaseUrl(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return cleanPath === '/' ? parsed.origin : `${parsed.origin}${cleanPath}`;
  } catch {
    return '';
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL as string | undefined
);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

let inMemoryWorkspaceToken: string | null = null;

export function setWorkspaceToken(token: string | null | undefined) {
  if (token && typeof token === 'string') {
    inMemoryWorkspaceToken = token;
  }
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'ViralFlow',
    ...(extra || {}),
  };
  if (inMemoryWorkspaceToken) {
    headers.Authorization = `Bearer ${inMemoryWorkspaceToken}`;
  }
  return headers;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
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

  try {
    return await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: getAuthHeaders(extraHeaders),
    });
  } catch {
    const targetHint = API_BASE_URL
      ? `Check that ${API_BASE_URL}/api/health is reachable and CORS_ORIGIN allows this domain.`
      : 'Set VITE_API_BASE_URL to your deployed Node backend URL or open the hosted studio URL.';
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

  constructor(message: string, status: number, code?: string, billing?: BillingStatus) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.billing = billing;
  }
}

export async function parseApiJson<T>(res: Response, fallbackError: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const targetHint = API_BASE_URL
      ? `Verify ${API_BASE_URL}/api/health responds with JSON.`
      : 'Deploy the Node backend and set VITE_API_BASE_URL for the frontend.';
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
