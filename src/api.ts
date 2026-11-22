import { datasetSchema, type Dataset, type RecordItem } from './domain';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let sessionEpoch = 0;
let absoluteExpiry = 0;
let idleExpiry = 0;
export function clearPrivateSession() {
  sessionEpoch += 1;
  absoluteExpiry = 0;
  idleExpiry = 0;
  window.dispatchEvent(new Event('dc-session-ended'));
}
export function expireSessionIfNeeded(now = Date.now()) {
  if ((absoluteExpiry && now >= absoluteExpiry) || (idleExpiry && now >= idleExpiry))
    clearPrivateSession();
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  if (['auth/logout', 'auth/sessions/revoke-all'].includes(path)) clearPrivateSession();
  const epoch = sessionEpoch;
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new ApiError(
      503,
      'The private server is not available here. Run the server locally to connect your workspace.',
    );
  const value: unknown = await response.json();
  if (epoch !== sessionEpoch)
    throw new ApiError(401, 'The session changed. Sign in again if needed.');
  if (response.status === 401) clearPrivateSession();
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof value === 'object' && value !== null && 'message' in value
        ? String(value.message)
        : 'The request could not be completed.',
    );
  if (['auth/register/verify', 'auth/login/verify', 'auth/recovery/rotate'].includes(path))
    sessionEpoch += 1;
  if (
    path === 'auth/recover' ||
    (path === 'auth/credentials/revoke' &&
      !!value &&
      typeof value === 'object' &&
      'signedOut' in value &&
      value.signedOut)
  )
    clearPrivateSession();
  const absolute = Number(response.headers.get('x-session-expires-at'));
  const idle = Number(response.headers.get('x-session-idle-expires-at'));
  if (Number.isFinite(absolute) && absolute > 0) absoluteExpiry = absolute;
  if (Number.isFinite(idle) && idle > 0) idleExpiry = idle;
  return value as T;
}
export async function loadDataset(): Promise<Dataset> {
  return datasetSchema.parse(await request('workspace'));
}
export async function loadRecords(resource: string): Promise<RecordItem[]> {
  const result = await request<{ items: RecordItem[] }>(`records/${encodeURIComponent(resource)}`);
  return result.items;
}
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
