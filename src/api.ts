import { datasetSchema, type Dataset, type RecordItem } from './domain';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
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
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof value === 'object' && value !== null && 'message' in value
        ? String(value.message)
        : 'The request could not be completed.',
    );
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
