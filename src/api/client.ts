import type {
  DailyModelStat,
  DailyStat,
  ModelTokenStat,
  OpenCodeAccount,
  Overview,
  QuotaAccount,
  ServiceConfig,
  UsageRecord,
  UsageResponse,
} from './types';

const BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8788') + '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ': ' + text : ''}`);
  }
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return req<T>('POST', path, body);
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  return req<T>('PUT', path, body);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ': ' + text : ''}`);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ': ' + text : ''}`);
  }
  return res.json();
}

export const api = {
  // Consolidated dashboard (overview + quota + recent usage in one call)
  getDashboard: (period = '30d') => get<{
    overview: Overview;
    quota: QuotaAccount[];
    recent_usage: { records: UsageRecord[]; total: number };
    model_tokens: ModelTokenStat[];
    period: string;
  }>(`/dashboard?period=${period}`),
  // Config
  getConfig: () => get<ServiceConfig>('/config'),

  // Accounts
  listOpenCodeAccounts: () => get<OpenCodeAccount[]>('/accounts/opencode'),
  createOpenCodeAccount: (data: {
    name: string;
    workspace_id?: string;
    auth_cookie: string;
  }) => post<OpenCodeAccount>('/accounts/opencode', data),
  updateOpenCodeAccount: (id: string, data: Record<string, unknown>) =>
    put<OpenCodeAccount>(`/accounts/opencode/${id}`, data),
  deleteOpenCodeAccount: (id: string) => del<{ ok: boolean }>(`/accounts/opencode/${id}`),
  testOpenCodeAccount: (id: string) =>
    post<{ success: boolean; workspace_id?: string; error?: string }>(
      `/accounts/opencode/${id}/test`,
    ),

  // Quota
  getQuota: () => get<QuotaAccount[]>('/quota'),
  getAccountQuota: (id: string) => get<QuotaAccount>(`/accounts/opencode/${id}/quota`),

  // Usage Records
  getAccountUsage: (id: string, offset = 0, limit = 100, keyId?: string) => {
    let path = `/accounts/opencode/${id}/usage?offset=${offset}&limit=${limit}`;
    if (keyId) path += `&key_id=${encodeURIComponent(keyId)}`;
    return get<UsageResponse>(path);
  },
  getAllUsage: (offset = 0, limit = 50, accountId?: string) => {
    let path = `/usage/all?offset=${offset}&limit=${limit}`;
    if (accountId) path += `&account_id=${encodeURIComponent(accountId)}`;
    return get<UsageResponse>(path);
  },
  syncUsage: (id: string) =>
    post<{ inserted: number; pages_fetched: number; sync_at: string }>(
      `/accounts/opencode/${id}/usage/sync`,
    ),
  backfillUsage: (id: string) =>
    post<{ inserted: number; pages_fetched: number; sync_at: string }>(
      `/accounts/opencode/${id}/usage/backfill`,
    ),

  // Analytics
  getOverview: () => get<Overview>('/analytics/overview'),
  getDailyStats: (days = 30, accountId?: string) => {
    let path = `/analytics/opencode/daily?days=${days}`;
    if (accountId) path += `&account_id=${encodeURIComponent(accountId)}`;
    return get<{ days: number; stats: DailyStat[] }>(path);
  },
  getDailyModelStats: (days = 30, accountId?: string) => {
    let path = `/analytics/opencode/daily/models?days=${days}`;
    if (accountId) path += `&account_id=${encodeURIComponent(accountId)}`;
    return get<{ days: number; stats: DailyModelStat[] }>(path);
  },
  getModelTokenStats: (days = 30, accountId?: string) => {
    let path = `/analytics/opencode/model-tokens?days=${days}`;
    if (accountId) path += `&account_id=${encodeURIComponent(accountId)}`;
    return get<{ days: number; stats: ModelTokenStat[] }>(path);
  },

  // Config
  updateConfig: (data: Record<string, unknown>) =>
    put<ServiceConfig>('/config', data),

  // Health
  health: () => get<{ status: string }>('/health'),
};
