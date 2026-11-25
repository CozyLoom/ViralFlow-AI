import { BillingStatus } from '../types/creator';

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
    throw new ApiRequestError(
      'The backend API server is not running on this host. Start the Node server (npm start) or open the hosted studio URL to run live AI generation.',
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
