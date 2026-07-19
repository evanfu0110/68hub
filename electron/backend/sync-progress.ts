interface ProgressEntry {
  current: number;
  total: number;
  inserted: number;
  status: string;
  updated_at: number;
  error?: string;
}

const progress = new Map<string, ProgressEntry>();

export function start(accountId: string, totalPages: number): void {
  progress.set(accountId, {
    current: 0,
    total: totalPages,
    inserted: 0,
    status: 'running',
    updated_at: Date.now() / 1000,
  });
}

export function update(accountId: string, current: number, inserted: number): void {
  const entry = progress.get(accountId);
  if (!entry) return;
  entry.current = current;
  entry.inserted = inserted;
  entry.updated_at = Date.now() / 1000;
}

export function finish(accountId: string, inserted: number): void {
  const entry = progress.get(accountId);
  if (!entry) return;
  entry.current = entry.total;
  entry.inserted = inserted;
  entry.status = 'done';
  entry.updated_at = Date.now() / 1000;
}

export function error(accountId: string, message: string): void {
  const entry = progress.get(accountId);
  if (!entry) return;
  entry.status = 'error';
  entry.error = message;
  entry.updated_at = Date.now() / 1000;
}

export function get(accountId: string): Record<string, unknown> {
  const entry = progress.get(accountId);
  if (!entry) {
    return { status: 'idle', current: 0, total: 0, inserted: 0 };
  }
  const result: Record<string, unknown> = { ...entry };
  if (Date.now() / 1000 - entry.updated_at > 30) {
    result.status = 'timeout';
  }
  return result;
}
