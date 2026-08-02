import type {
  AccountTestResult,
  AppSettings,
  DailyModelStat,
  DailyStat,
  ModelTokenStat,
  SyncProgress,
} from './types';
import type { Account } from './generated/Account';
import type { AccountInput } from './generated/AccountInput';
import type { AccountUpdate } from './generated/AccountUpdate';
import type { Dashboard } from './generated/Dashboard';
import type { StatsQuery } from './generated/StatsQuery';
import type { SyncResult } from './generated/SyncResult';
import type { UsagePage } from './generated/UsagePage';
import type { UsageQuery } from './generated/UsageQuery';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function invokeTransport(): TauriInvoke {
  const transport = window.__TAURI__?.core?.invoke;
  if (!transport) throw new Error('Tauri Android runtime is unavailable');
  return transport;
}

export interface HubError {
  code: string;
  message: string;
  retryable: boolean;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invokeTransport()<T>(command, args);
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
  isTauri: () => true,
  getAppVersion: () => invoke<string>('get_app_version'),
  getDashboard: (period = '30d') =>
    hubClient.getDashboard(period as '5h' | '7d' | '30d'),
  listOpenCodeAccounts: () => hubClient.listAccounts(),
  createOpenCodeAccount: (input: {
    name: string;
    workspace_id?: string;
    auth_cookie: string;
  }) =>
    hubClient.createAccount({
      ...input,
      workspace_id: input.workspace_id || 'Default',
    }),
  updateOpenCodeAccount: (id: string, input: Record<string, unknown>) =>
    hubClient.updateAccount(id, input as AccountUpdate),
  deleteOpenCodeAccount: (id: string) => hubClient.deleteAccount(id),
  testOpenCodeAccount: (id: string) => hubClient.testAccount(id),
  syncUsage: (id: string) => hubClient.syncUsage(id),
  syncProgress: (id: string) => invoke<SyncProgress>('get_sync_progress', { id }),
  getAllUsage: (offset = 0, limit = 50, accountId?: string) =>
    hubClient.getUsage({ offset, limit, account_id: accountId || null }),
  getDailyStats: async (days = 30, accountId?: string) => ({
    days,
    stats: await hubClient.getDailyStats({ days, account_id: accountId || null }),
  }),
  getDailyModelStats: async (days = 30, accountId?: string) => ({
    days,
    stats: await hubClient.getDailyModelStats({ days, account_id: accountId || null }),
  }),
  getModelTokenStats: async (days = 30, accountId?: string) => ({
    days,
    stats: await hubClient.getModelStats({ days, account_id: accountId || null }),
  }),
  getSettings: () => hubClient.getSettings(),
  updateSettings: (input: Partial<AppSettings>) => hubClient.updateSettings(input),
};
