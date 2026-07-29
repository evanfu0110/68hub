import type {
  AccountTestResult,
  AppSettings,
  DailyModelStat,
  DailyStat,
  ModelTokenStat,
  OpenCodeAccount,
  Overview,
  QuotaAccount,
  SyncProgress,
  UsageResponse,
} from './types';
import type { Account } from './generated/Account';
import type { AccountInput } from './generated/AccountInput';
import type { AccountUpdate } from './generated/AccountUpdate';
import type { Dashboard } from './generated/Dashboard';
import type { StatsQuery } from './generated/StatsQuery';
import type { SyncResult } from './generated/SyncResult';
import type { UsagePage } from './generated/UsagePage';
import type { UsageQuery } from './generated/UsageQuery';

const REST_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8788') + '/api';

export interface HubError {
  code: string;
  message: string;
  retryable: boolean;
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface DashboardResponse {
  overview: Overview;
  quota: QuotaAccount[];
  recent_usage: { records: UsageResponse['records']; total: number };
  model_tokens: ModelTokenStat[];
  period: string;
}

function tauriInvoke(): TauriInvoke | null {
  return window.__TAURI__?.core?.invoke ?? null;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const transport = tauriInvoke();
  if (!transport) throw new Error('Tauri transport is unavailable');
  try {
    return await transport<T>(command, args);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      const payload = error as Partial<HubError>;
      const normalized = new Error(String(payload.message));
      Object.assign(normalized, payload);
      throw normalized;
    }
    throw error;
  }
}

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${REST_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
  }
  return response.json();
}

const isTauri = () => Boolean(tauriInvoke());

export interface HubClient {
  getDashboard(period: '5h' | '7d' | '30d'): Promise<Dashboard>;
  listAccounts(): Promise<Account[]>;
  createAccount(input: AccountInput): Promise<Account>;
  updateAccount(id: string, input: AccountUpdate): Promise<Account>;
  deleteAccount(id: string): Promise<void>;
  testAccount(id: string): Promise<AccountTestResult>;
  syncUsage(id: string): Promise<SyncResult>;
  getUsage(query: UsageQuery): Promise<UsagePage>;
  getDailyStats(query: StatsQuery): Promise<DailyStat[]>;
  getDailyModelStats(query: StatsQuery): Promise<DailyModelStat[]>;
  getModelStats(query: StatsQuery): Promise<ModelTokenStat[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(input: Partial<AppSettings>): Promise<AppSettings>;
}

export const hubClient: HubClient = {
  getDashboard: (period) => invoke<Dashboard>('get_dashboard', { period }),
  listAccounts: () => invoke<Account[]>('list_accounts'),
  createAccount: (input) => invoke<Account>('create_account', { input }),
  updateAccount: (id, input) => invoke<Account>('update_account', { id, input }),
  deleteAccount: (id) => invoke<void>('delete_account', { id }),
  testAccount: (id) => invoke<AccountTestResult>('test_account', { id }),
  syncUsage: (id) => invoke<SyncResult>('sync_usage', { id }),
  getUsage: (query) => invoke<UsagePage>('get_usage', { query }),
  getDailyStats: (query) => invoke<DailyStat[]>('get_daily_stats', { query }),
  getDailyModelStats: (query) =>
    invoke<DailyModelStat[]>('get_daily_model_stats', { query }),
  getModelStats: (query) => invoke<ModelTokenStat[]>('get_model_stats', { query }),
  getSettings: () => invoke<AppSettings>('get_settings'),
  updateSettings: (input) => invoke<AppSettings>('update_settings', { input }),
};

export const api = {
  isTauri,

  getAppVersion: () =>
    isTauri()
      ? invoke<string>('get_app_version')
      : window.electronAPI?.getVersion?.() ?? Promise.resolve('2.0.0'),

  getDashboard: (period = '30d') =>
    isTauri()
      ? hubClient.getDashboard(period as '5h' | '7d' | '30d')
      : rest<DashboardResponse>('GET', `/dashboard?period=${period}`),

  listOpenCodeAccounts: () =>
    isTauri()
      ? hubClient.listAccounts()
      : rest<OpenCodeAccount[]>('GET', '/accounts/opencode'),

  createOpenCodeAccount: (input: {
    name: string;
    workspace_id?: string;
    auth_cookie: string;
  }) =>
    isTauri()
      ? hubClient.createAccount({ ...input, workspace_id: input.workspace_id || 'Default' })
      : rest<OpenCodeAccount>('POST', '/accounts/opencode', input),

  updateOpenCodeAccount: (id: string, input: Record<string, unknown>) =>
    isTauri()
      ? hubClient.updateAccount(id, input as AccountUpdate)
      : rest<OpenCodeAccount>('PUT', `/accounts/opencode/${id}`, input),

  deleteOpenCodeAccount: (id: string) =>
    isTauri()
      ? hubClient.deleteAccount(id)
      : rest<{ ok: boolean }>('DELETE', `/accounts/opencode/${id}`),

  testOpenCodeAccount: (id: string) =>
    isTauri()
      ? hubClient.testAccount(id)
      : rest<AccountTestResult>('POST', `/accounts/opencode/${id}/test`),

  syncUsage: (id: string) =>
    isTauri()
      ? hubClient.syncUsage(id)
      : rest<{ inserted: number; pages_fetched: number; sync_at: string }>(
          'POST',
          `/accounts/opencode/${id}/usage/sync`,
        ),

  syncProgress: (id: string) =>
    isTauri()
      ? invoke<SyncProgress>('get_sync_progress', { id })
      : rest<SyncProgress>('GET', `/accounts/opencode/${id}/usage/progress`),

  getAllUsage: (offset = 0, limit = 50, accountId?: string) =>
    isTauri()
      ? hubClient.getUsage({ offset, limit, account_id: accountId || null })
      : rest<UsageResponse>(
          'GET',
          `/usage/all?offset=${offset}&limit=${limit}${
            accountId ? `&account_id=${encodeURIComponent(accountId)}` : ''
          }`,
        ),

  getDailyStats: async (days = 30, accountId?: string) => {
    if (!isTauri()) {
      return rest<{ days: number; stats: DailyStat[] }>(
        'GET',
        `/analytics/opencode/daily?days=${days}${
          accountId ? `&account_id=${encodeURIComponent(accountId)}` : ''
        }`,
      );
    }
    const stats = await hubClient.getDailyStats({ days, account_id: accountId || null });
    return { days, stats };
  },

  getDailyModelStats: async (days = 30, accountId?: string) => {
    if (!isTauri()) {
      return rest<{ days: number; stats: DailyModelStat[] }>(
        'GET',
        `/analytics/opencode/daily/models?days=${days}${
          accountId ? `&account_id=${encodeURIComponent(accountId)}` : ''
        }`,
      );
    }
    const stats = await hubClient.getDailyModelStats({ days, account_id: accountId || null });
    return { days, stats };
  },

  getModelTokenStats: async (days = 30, accountId?: string) => {
    if (!isTauri()) {
      return rest<{ days: number; stats: ModelTokenStat[] }>(
        'GET',
        `/analytics/opencode/model-tokens?days=${days}${
          accountId ? `&account_id=${encodeURIComponent(accountId)}` : ''
        }`,
      );
    }
    const stats = await hubClient.getModelStats({ days, account_id: accountId || null });
    return { days, stats };
  },

  getSettings: () =>
    isTauri()
      ? hubClient.getSettings()
      : Promise.resolve<AppSettings>({ theme: 'system', language: 'system' }),

  updateSettings: (input: Partial<AppSettings>) =>
    isTauri()
      ? hubClient.updateSettings(input)
      : Promise.resolve<AppSettings>({
          theme: input.theme || 'system',
          language: input.language || 'system',
        }),
};
