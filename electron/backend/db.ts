import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { dataDir } from './config';

export interface OpenCodeAccountRow {
  id: string;
  name: string;
  workspace_id: string;
  resolved_workspace_id: string | null;
  auth_cookie: string;
  show_rolling: boolean;
  show_weekly: boolean;
  show_monthly: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface OllamaAccountRow {
  id: string;
  name: string;
  session_cookie: string;
  show_session: boolean;
  show_weekly: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageRecordRow {
  usg_id: string;
  account_id: string;
  workspace_id: string;
  created_at: string;
  model: string;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_raw: number;
  cost_usd: number;
  key_id: string | null;
  plan: string | null;
  synced_at: string;
}

export interface UsageRecordWithAccount extends UsageRecordRow {
  account_name: string;
}

export interface UsageSyncStateRow {
  account_id: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_inserted_count: number;
  deepest_page_fetched: number;
  total_records: number;
  oldest_record_at: string | null;
  newest_record_at: string | null;
}

let _db: Database.Database | null = null;

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function dbPath(): string {
  return path.join(dataDir(), '68backend.db');
}

export function importedFlagPath(): string {
  return path.join(dataDir(), '.imported');
}

function mapOpenCode(row: Record<string, unknown>): OpenCodeAccountRow {
  return {
    id: String(row.id),
    name: String(row.name),
    workspace_id: String(row.workspace_id),
    resolved_workspace_id: row.resolved_workspace_id != null ? String(row.resolved_workspace_id) : null,
    auth_cookie: String(row.auth_cookie),
    show_rolling: Boolean(row.show_rolling),
    show_weekly: Boolean(row.show_weekly),
    show_monthly: Boolean(row.show_monthly),
    enabled: Boolean(row.enabled),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapOllama(row: Record<string, unknown>): OllamaAccountRow {
  return {
    id: String(row.id),
    name: String(row.name),
    session_cookie: String(row.session_cookie),
    show_session: Boolean(row.show_session),
    show_weekly: Boolean(row.show_weekly),
    enabled: Boolean(row.enabled),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapUsage(row: Record<string, unknown>): UsageRecordRow {
  return {
    usg_id: String(row.usg_id),
    account_id: String(row.account_id),
    workspace_id: String(row.workspace_id),
    created_at: String(row.created_at),
    model: String(row.model),
    provider: row.provider != null ? String(row.provider) : null,
    input_tokens: Number(row.input_tokens),
    output_tokens: Number(row.output_tokens),
    cost_raw: Number(row.cost_raw),
    cost_usd: Number(row.cost_usd),
    key_id: row.key_id != null ? String(row.key_id) : null,
    plan: row.plan != null ? String(row.plan) : null,
    synced_at: String(row.synced_at),
  };
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const p = dbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  _db = new Database(p);
  _db.pragma('foreign_keys = ON');
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function initDb(): void {
  const conn = getDb();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS opencode_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT 'Default',
      resolved_workspace_id TEXT,
      auth_cookie TEXT NOT NULL,
      show_rolling INTEGER NOT NULL DEFAULT 1,
      show_weekly INTEGER NOT NULL DEFAULT 1,
      show_monthly INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ollama_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      session_cookie TEXT NOT NULL,
      show_session INTEGER NOT NULL DEFAULT 1,
      show_weekly INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      usg_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES opencode_accounts(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_raw INTEGER NOT NULL,
      cost_usd REAL NOT NULL,
      key_id TEXT,
      plan TEXT,
      synced_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_account_time
      ON usage_records(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_account_key
      ON usage_records(account_id, key_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS usage_sync_state (
      account_id TEXT PRIMARY KEY REFERENCES opencode_accounts(id) ON DELETE CASCADE,
      last_sync_at TEXT,
      last_sync_status TEXT,
      last_sync_error TEXT,
      last_inserted_count INTEGER NOT NULL DEFAULT 0,
      deepest_page_fetched INTEGER NOT NULL DEFAULT -1,
      total_records INTEGER NOT NULL DEFAULT 0,
      oldest_record_at TEXT,
      newest_record_at TEXT
    );

    CREATE TABLE IF NOT EXISTS service_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function usageRecordToDict(r: UsageRecordRow): Record<string, unknown> {
  return {
    usg_id: r.usg_id,
    account_id: r.account_id,
    created_at: r.created_at,
    model: r.model,
    provider: r.provider,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: r.cost_usd,
    key_id: r.key_id,
    plan: r.plan,
  };
}

export function usageRecordWithAccountToDict(r: UsageRecordWithAccount): Record<string, unknown> {
  return { ...usageRecordToDict(r), account_name: r.account_name };
}

export function usageSyncStateToDict(s: UsageSyncStateRow): Record<string, unknown> {
  return {
    last_sync_at: s.last_sync_at,
    last_sync_status: s.last_sync_status,
    last_sync_error: s.last_sync_error,
    last_inserted_count: s.last_inserted_count,
    deepest_page_fetched: s.deepest_page_fetched,
    total_records: s.total_records,
    oldest_record_at: s.oldest_record_at,
    newest_record_at: s.newest_record_at,
  };
}

export function listOpencodeAccounts(enabledOnly = false): OpenCodeAccountRow[] {
  const conn = getDb();
  let sql = 'SELECT * FROM opencode_accounts';
  if (enabledOnly) sql += ' WHERE enabled = 1';
  sql += ' ORDER BY created_at ASC';
  return conn.prepare(sql).all().map((r) => mapOpenCode(r as Record<string, unknown>));
}

export function getOpencodeAccount(accountId: string): OpenCodeAccountRow | null {
  const row = getDb().prepare('SELECT * FROM opencode_accounts WHERE id = ?').get(accountId);
  return row ? mapOpenCode(row as Record<string, unknown>) : null;
}

export function createOpencodeAccount(opts: {
  name: string;
  workspace_id: string;
  auth_cookie: string;
  show_rolling?: boolean;
  show_weekly?: boolean;
  show_monthly?: boolean;
  enabled?: boolean;
}): OpenCodeAccountRow {
  const accountId = randomUUID();
  const now = nowIso();
  const conn = getDb();
  conn
    .prepare(
      `INSERT INTO opencode_accounts (
        id, name, workspace_id, resolved_workspace_id, auth_cookie,
        show_rolling, show_weekly, show_monthly, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      accountId,
      opts.name,
      opts.workspace_id,
      opts.auth_cookie,
      opts.show_rolling !== false ? 1 : 0,
      opts.show_weekly !== false ? 1 : 0,
      opts.show_monthly !== false ? 1 : 0,
      opts.enabled !== false ? 1 : 0,
      now,
      now,
    );
  conn.prepare('INSERT INTO usage_sync_state (account_id) VALUES (?)').run(accountId);
  const account = getOpencodeAccount(accountId);
  if (!account) throw new Error('failed to create account');
  return account;
}

export function updateOpencodeAccount(
  accountId: string,
  fields: Record<string, unknown>,
): OpenCodeAccountRow | null {
  const allowed = new Set([
    'name',
    'workspace_id',
    'resolved_workspace_id',
    'auth_cookie',
    'show_rolling',
    'show_weekly',
    'show_monthly',
    'enabled',
  ]);
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key) || value === undefined) continue;
    let v = value;
    if (['show_rolling', 'show_weekly', 'show_monthly', 'enabled'].includes(key)) {
      v = value ? 1 : 0;
    }
    // allow null for resolved_workspace_id
    if (value === null && key !== 'resolved_workspace_id') continue;
    updates.push(`${key} = ?`);
    values.push(v);
  }
  if (updates.length === 0) return getOpencodeAccount(accountId);
  updates.push('updated_at = ?');
  values.push(nowIso());
  values.push(accountId);
  const result = getDb()
    .prepare(`UPDATE opencode_accounts SET ${updates.join(', ')} WHERE id = ?`)
    .run(...values);
  if (result.changes === 0) return null;
  return getOpencodeAccount(accountId);
}

export function deleteOpencodeAccount(accountId: string): boolean {
  const result = getDb().prepare('DELETE FROM opencode_accounts WHERE id = ?').run(accountId);
  return result.changes > 0;
}

export function listOllamaAccounts(enabledOnly = false): OllamaAccountRow[] {
  let sql = 'SELECT * FROM ollama_accounts';
  if (enabledOnly) sql += ' WHERE enabled = 1';
  sql += ' ORDER BY created_at ASC';
  return getDb()
    .prepare(sql)
    .all()
    .map((r) => mapOllama(r as Record<string, unknown>));
}

export function getOllamaAccount(accountId: string): OllamaAccountRow | null {
  const row = getDb().prepare('SELECT * FROM ollama_accounts WHERE id = ?').get(accountId);
  return row ? mapOllama(row as Record<string, unknown>) : null;
}

export function createOllamaAccount(opts: {
  name: string;
  session_cookie: string;
  show_session?: boolean;
  show_weekly?: boolean;
  enabled?: boolean;
}): OllamaAccountRow {
  const accountId = randomUUID();
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO ollama_accounts (
        id, name, session_cookie, show_session, show_weekly, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      accountId,
      opts.name,
      opts.session_cookie,
      opts.show_session !== false ? 1 : 0,
      opts.show_weekly !== false ? 1 : 0,
      opts.enabled !== false ? 1 : 0,
      now,
      now,
    );
  const account = getOllamaAccount(accountId);
  if (!account) throw new Error('failed to create ollama account');
  return account;
}

export function updateOllamaAccount(
  accountId: string,
  fields: Record<string, unknown>,
): OllamaAccountRow | null {
  const allowed = new Set(['name', 'session_cookie', 'show_session', 'show_weekly', 'enabled']);
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key) || value === undefined || value === null) continue;
    let v = value;
    if (['show_session', 'show_weekly', 'enabled'].includes(key)) {
      v = value ? 1 : 0;
    }
    updates.push(`${key} = ?`);
    values.push(v);
  }
  if (updates.length === 0) return getOllamaAccount(accountId);
  updates.push('updated_at = ?');
  values.push(nowIso());
  values.push(accountId);
  const result = getDb()
    .prepare(`UPDATE ollama_accounts SET ${updates.join(', ')} WHERE id = ?`)
    .run(...values);
  if (result.changes === 0) return null;
  return getOllamaAccount(accountId);
}

export function deleteOllamaAccount(accountId: string): boolean {
  const result = getDb().prepare('DELETE FROM ollama_accounts WHERE id = ?').run(accountId);
  return result.changes > 0;
}

export function insertUsageRecordsIgnore(
  accountId: string,
  workspaceId: string,
  records: Record<string, unknown>[],
): number {
  if (!records.length) return 0;
  const syncedAt = nowIso();
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO usage_records (
      usg_id, account_id, workspace_id, created_at, model, provider,
      input_tokens, output_tokens, cost_raw, cost_usd, key_id, plan, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let inserted = 0;
  const tx = getDb().transaction(() => {
    for (const rec of records) {
      const result = stmt.run(
        rec.usg_id,
        accountId,
        workspaceId,
        rec.created_at,
        rec.model,
        rec.provider ?? null,
        rec.input_tokens,
        rec.output_tokens,
        rec.cost_raw,
        rec.cost_usd,
        rec.key_id ?? null,
        rec.plan ?? null,
        syncedAt,
      );
      inserted += result.changes;
    }
  });
  tx();
  return inserted;
}

export function listUsageRecords(
  accountId: string,
  opts: { offset?: number; limit?: number; key_id?: string | null } = {},
): [UsageRecordRow[], number] {
  let offset = Math.max(0, opts.offset ?? 0);
  let limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  let where = 'WHERE account_id = ?';
  const params: unknown[] = [accountId];
  if (opts.key_id) {
    where += ' AND key_id = ?';
    params.push(opts.key_id);
  }
  const conn = getDb();
  const total = Number(
    (conn.prepare(`SELECT COUNT(*) AS c FROM usage_records ${where}`).get(...params) as { c: number })
      .c,
  );
  const rows = conn
    .prepare(
      `SELECT * FROM usage_records ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);
  return [rows.map((r) => mapUsage(r as Record<string, unknown>)), total];
}

export function listUsageKeyIds(accountId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT key_id FROM usage_records
       WHERE account_id = ? AND key_id IS NOT NULL AND key_id != ''
       ORDER BY key_id`,
    )
    .all(accountId) as { key_id: string }[];
  return rows.map((r) => r.key_id);
}

export function listAllUsageRecords(opts: {
  offset?: number;
  limit?: number;
  account_id?: string | null;
} = {}): [UsageRecordWithAccount[], number] {
  let offset = Math.max(0, opts.offset ?? 0);
  let limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  let where = '';
  const params: unknown[] = [];
  if (opts.account_id) {
    where = 'WHERE ur.account_id = ?';
    params.push(opts.account_id);
  }
  const conn = getDb();
  const total = Number(
    (
      conn
        .prepare(
          `SELECT COUNT(*) AS c FROM usage_records ur
           JOIN opencode_accounts oa ON oa.id = ur.account_id
           ${where}`,
        )
        .get(...params) as { c: number }
    ).c,
  );
  const rows = conn
    .prepare(
      `SELECT ur.*, oa.name AS account_name
       FROM usage_records ur
       JOIN opencode_accounts oa ON oa.id = ur.account_id
       ${where}
       ORDER BY ur.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);
  const records = rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...mapUsage(row),
      account_name: String(row.account_name),
    };
  });
  return [records, total];
}

export function opencodeDailyStats(days = 30, accountId?: string | null): Record<string, unknown>[] {
  days = Math.max(1, Math.min(days, 365));
  let where = "WHERE substr(created_at, 1, 10) >= date('now', ?)";
  const params: unknown[] = [`-${days} days`];
  if (accountId) {
    where += ' AND account_id = ?';
    params.push(accountId);
  }
  const rows = getDb()
    .prepare(
      `SELECT substr(created_at, 1, 10) AS date,
              SUM(cost_usd) AS total_cost_usd,
              COUNT(*) AS request_count
       FROM usage_records
       ${where}
       GROUP BY substr(created_at, 1, 10)
       ORDER BY date DESC`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    date: r.date,
    total_cost_usd: Math.round(Number(r.total_cost_usd || 0) * 1e6) / 1e6,
    request_count: Number(r.request_count),
  }));
}

export function opencodeDailyModelStats(
  days = 30,
  accountId?: string | null,
): Record<string, unknown>[] {
  days = Math.max(1, Math.min(days, 365));
  let where = "WHERE substr(created_at, 1, 10) >= date('now', ?)";
  const params: unknown[] = [`-${days} days`];
  if (accountId) {
    where += ' AND account_id = ?';
    params.push(accountId);
  }
  const rows = getDb()
    .prepare(
      `SELECT substr(created_at, 1, 10) AS date,
              model,
              SUM(cost_usd) AS total_cost_usd,
              COUNT(*) AS request_count
       FROM usage_records
       ${where}
       GROUP BY substr(created_at, 1, 10), model
       ORDER BY date ASC, model ASC`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    date: r.date,
    model: r.model,
    total_cost_usd: Math.round(Number(r.total_cost_usd || 0) * 1e6) / 1e6,
    request_count: Number(r.request_count),
  }));
}

export function getUsageSyncState(accountId: string): UsageSyncStateRow {
  const row = getDb()
    .prepare('SELECT * FROM usage_sync_state WHERE account_id = ?')
    .get(accountId) as Record<string, unknown> | undefined;
  if (!row) {
    return {
      account_id: accountId,
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
      last_inserted_count: 0,
      deepest_page_fetched: -1,
      total_records: 0,
      oldest_record_at: null,
      newest_record_at: null,
    };
  }
  return {
    account_id: accountId,
    last_sync_at: row.last_sync_at != null ? String(row.last_sync_at) : null,
    last_sync_status: row.last_sync_status != null ? String(row.last_sync_status) : null,
    last_sync_error: row.last_sync_error != null ? String(row.last_sync_error) : null,
    last_inserted_count: Number(row.last_inserted_count),
    deepest_page_fetched: Number(row.deepest_page_fetched),
    total_records: Number(row.total_records),
    oldest_record_at: row.oldest_record_at != null ? String(row.oldest_record_at) : null,
    newest_record_at: row.newest_record_at != null ? String(row.newest_record_at) : null,
  };
}

export function updateUsageSyncState(accountId: string, fields: Record<string, unknown>): void {
  const allowed = new Set([
    'last_sync_at',
    'last_sync_status',
    'last_sync_error',
    'last_inserted_count',
    'deepest_page_fetched',
    'total_records',
    'oldest_record_at',
    'newest_record_at',
  ]);
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) continue;
    updates.push(`${key} = ?`);
    values.push(value);
  }
  if (!updates.length) return;
  values.push(accountId);
  getDb()
    .prepare(`UPDATE usage_sync_state SET ${updates.join(', ')} WHERE account_id = ?`)
    .run(...values);
}

export function refreshUsageSyncTotals(accountId: string): void {
  const conn = getDb();
  const row = conn
    .prepare(
      `SELECT COUNT(*) AS total,
              MIN(created_at) AS oldest,
              MAX(created_at) AS newest
       FROM usage_records WHERE account_id = ?`,
    )
    .get(accountId) as { total: number; oldest: string | null; newest: string | null };
  conn
    .prepare(
      `UPDATE usage_sync_state
       SET total_records = ?, oldest_record_at = ?, newest_record_at = ?
       WHERE account_id = ?`,
    )
    .run(row.total, row.oldest, row.newest, accountId);
}

export function hasServiceSettings(): boolean {
  const row = getDb().prepare('SELECT 1 AS x FROM service_settings WHERE id = 1').get();
  return !!row;
}

export function getServiceSettingsPayload(): Record<string, unknown> {
  const row = getDb().prepare('SELECT payload FROM service_settings WHERE id = 1').get() as
    | { payload: string }
    | undefined;
  if (!row) return {};
  try {
    const data = JSON.parse(row.payload);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function saveServiceSettingsPayload(payload: Record<string, unknown>): void {
  getDb()
    .prepare(
      `INSERT INTO service_settings (id, payload, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(payload), nowIso());
}

export function opencodeModelTokenStats(
  period = '30d',
  accountId?: string | null,
): Record<string, unknown>[] {
  let where: string;
  if (period === '5h') {
    where = "WHERE datetime(created_at) >= datetime('now', '-5 hours')";
  } else if (period === '7d') {
    where = "WHERE datetime(created_at) >= datetime('now', '-7 days')";
  } else {
    where = "WHERE datetime(created_at) >= datetime('now', '-30 days')";
  }
  const params: unknown[] = [];
  if (accountId) {
    where += ' AND account_id = ?';
    params.push(accountId);
  }
  const rows = getDb()
    .prepare(
      `SELECT model,
              COUNT(*) AS request_count,
              SUM(input_tokens) AS total_input_tokens,
              SUM(output_tokens) AS total_output_tokens,
              SUM(cost_usd) AS total_cost_usd
       FROM usage_records
       ${where}
       GROUP BY model
       ORDER BY (total_input_tokens + total_output_tokens) DESC`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    model: r.model,
    request_count: Number(r.request_count),
    total_input_tokens: Number(r.total_input_tokens || 0),
    total_output_tokens: Number(r.total_output_tokens || 0),
    total_cost_usd: Math.round(Number(r.total_cost_usd || 0) * 1e6) / 1e6,
  }));
}

export function countOpencodeAccounts(): number {
  return Number(
    (getDb().prepare('SELECT COUNT(*) AS c FROM opencode_accounts').get() as { c: number }).c,
  );
}

export function countOllamaAccounts(): number {
  return Number(
    (getDb().prepare('SELECT COUNT(*) AS c FROM ollama_accounts').get() as { c: number }).c,
  );
}
