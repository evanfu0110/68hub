// Public frontend names are aliases of the DTOs generated from Rust by ts-rs.
// `cargo test` refreshes these files and CI rejects any uncommitted drift.
export type { AccountTestResult } from './generated/AccountTestResult';
export type { DailyModelStat } from './generated/DailyModelStat';
export type { DailyStat } from './generated/DailyStat';
export type { ModelTokenStat } from './generated/ModelTokenStat';
export type { Overview } from './generated/Overview';
export type { QuotaAccount } from './generated/QuotaAccount';
export type { QuotaWindow } from './generated/QuotaWindow';
export type { SyncProgress } from './generated/SyncProgress';
export type { UsageRecord } from './generated/UsageRecord';

export type { Account as OpenCodeAccount } from './generated/Account';
export type { UsagePage as UsageResponse } from './generated/UsagePage';

import type { Settings } from './generated/Settings';

export type AppSettings = Omit<Settings, 'theme' | 'language'> & {
  theme: 'light' | 'dark' | 'system';
  language: 'zh' | 'en' | 'system';
};
