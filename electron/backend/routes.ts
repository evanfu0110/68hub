import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import fs from 'fs';
import * as db from './db';
import { ensureBootstrapped } from './bootstrap';
import { buildOverview } from './analytics';
import {
  loadServiceConfig,
  maskCookie,
  maskOllamaCookie,
  saveSettingsPayload,
  updateServiceConfig,
  type AccountConfig,
  type OllamaAccountConfig,
} from './config';
import { fetchAllOllamaQuotas } from './ollama-quota';
import { resolveAccountWorkspaceId } from './opencode-usage';
import { fetchAllQuotas, fetchQuotaForAccount, quotaAccountToDict } from './quota';
import * as syncProgress from './sync-progress';
import { backfillUsage, syncResultToDict, syncUsage } from './usage-sync';

const OpenCodeAccountCreate = z.object({
  name: z.string(),
  workspace_id: z.string().optional().default('Default'),
  auth_cookie: z.string(),
  show_rolling: z.boolean().optional().default(true),
  show_weekly: z.boolean().optional().default(true),
  show_monthly: z.boolean().optional().default(true),
  enabled: z.boolean().optional().default(true),
});

const OpenCodeAccountUpdate = z.object({
  name: z.string().optional(),
  workspace_id: z.string().optional(),
  auth_cookie: z.string().optional(),
  show_rolling: z.boolean().optional(),
  show_weekly: z.boolean().optional(),
  show_monthly: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const OllamaAccountCreate = z.object({
  name: z.string(),
  session_cookie: z.string(),
  show_session: z.boolean().optional().default(true),
  show_weekly: z.boolean().optional().default(true),
  enabled: z.boolean().optional().default(true),
});

const OllamaAccountUpdate = z.object({
  name: z.string().optional(),
  session_cookie: z.string().optional(),
  show_session: z.boolean().optional(),
  show_weekly: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const ServiceConfigUpdate = z.object({
  refresh: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  usage_sync: z
    .object({
      auto_sync: z.boolean().optional(),
      interval_sec: z.number().optional(),
      backfill_pages_per_request: z.number().optional(),
      max_pages_per_incremental: z.number().optional(),
    })
    .optional(),
  opencode: z
    .object({
      usage_server_id: z.string().optional(),
    })
    .optional(),
});

function opencodeAccountDict(row: db.OpenCodeAccountRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    workspace_id: row.workspace_id,
    resolved_workspace_id: row.resolved_workspace_id,
    auth_cookie_masked: maskCookie(row.auth_cookie),
    configured: Boolean(row.auth_cookie.trim()),
    show_rolling: row.show_rolling,
    show_weekly: row.show_weekly,
    show_monthly: row.show_monthly,
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function ollamaAccountDict(row: db.OllamaAccountRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    session_cookie_masked: maskOllamaCookie(row.session_cookie),
    configured: Boolean(row.session_cookie.trim()),
    show_session: row.show_session,
    show_weekly: row.show_weekly,
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildConfigResponse(): Record<string, unknown> {
  const service = loadServiceConfig();
  return {
    refresh: {
      ollama: {
        auto_refresh: service.refresh_ollama.auto_refresh,
        interval_sec: service.refresh_ollama.interval_sec,
      },
      opencode_go: {
        auto_refresh: service.refresh_opencode_go.auto_refresh,
        interval_sec: service.refresh_opencode_go.interval_sec,
      },
    },
    usage_sync: {
      auto_sync: service.usage_sync.auto_sync,
      interval_sec: service.usage_sync.interval_sec,
      backfill_pages_per_request: service.usage_sync.backfill_pages_per_request,
      max_pages_per_incremental: service.usage_sync.max_pages_per_incremental,
    },
    accounts_imported:
      fs.existsSync(db.importedFlagPath()) ||
      db.countOpencodeAccounts() > 0 ||
      db.countOllamaAccounts() > 0,
    opencode_accounts: db.listOpencodeAccounts().map(opencodeAccountDict),
    ollama_accounts: db.listOllamaAccounts().map(ollamaAccountDict),
  };
}

async function fetchQuotaForDashboard(): Promise<Record<string, unknown>[]> {
  const rows = db.listOpencodeAccounts(true);
  if (!rows.length) return [];
  const accounts: AccountConfig[] = rows.map((row) => ({
    name: row.name,
    workspace_id: row.workspace_id,
    auth_cookie: row.auth_cookie,
    show_rolling: row.show_rolling,
    show_weekly: row.show_weekly,
    show_monthly: row.show_monthly,
  }));
  const results = await fetchAllQuotas(accounts);
  const idByName = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  for (const item of results) {
    item.account_id = idByName[String(item.name ?? '')];
  }
  return results;
}

export type RestartSyncFn = () => void;

export function createApp(opts: { onConfigUpdated?: RestartSyncFn } = {}): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as Record<string, unknown>).issues)) {
      return c.json({ detail: 'Validation error', issues: (err as Record<string, unknown>).issues }, 400);
    }
    console.error('[backend] unhandled error:', err);
    return c.json({ detail: String(err instanceof Error ? err.message : err) }, 500);
  });

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['*'],
    }),
  );

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/config', (c) => {
    try {
      ensureBootstrapped();
      return c.json(buildConfigResponse());
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 500);
    }
  });

  app.put('/api/config', async (c) => {
    try {
      ensureBootstrapped();
      const body = ServiceConfigUpdate.parse(await c.req.json());
      const updates: Record<string, unknown> = {};
      if (body.refresh) updates.refresh = body.refresh;
      if (body.usage_sync) updates.usage_sync = body.usage_sync;
      if (body.opencode) updates.opencode = body.opencode;
      updateServiceConfig(updates);
      opts.onConfigUpdated?.();
      return c.json(buildConfigResponse());
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 500);
    }
  });

  app.get('/api/accounts/opencode', (c) => {
    return c.json(db.listOpencodeAccounts().map(opencodeAccountDict));
  });

  app.post('/api/accounts/opencode', async (c) => {
    const body = OpenCodeAccountCreate.parse(await c.req.json());
    if (!body.auth_cookie.trim()) {
      return c.json({ detail: 'auth_cookie 不能为空' }, 400);
    }
    const row = db.createOpencodeAccount({
      name: body.name.trim() || 'OpenCode',
      workspace_id: (body.workspace_id || 'Default').trim() || 'Default',
      auth_cookie: body.auth_cookie.trim(),
      show_rolling: body.show_rolling,
      show_weekly: body.show_weekly,
      show_monthly: body.show_monthly,
      enabled: body.enabled,
    });
    return c.json(opencodeAccountDict(row));
  });

  app.get('/api/accounts/opencode/:accountId', (c) => {
    const row = db.getOpencodeAccount(c.req.param('accountId'));
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    return c.json(opencodeAccountDict(row));
  });

  app.put('/api/accounts/opencode/:accountId', async (c) => {
    const accountId = c.req.param('accountId');
    const body = OpenCodeAccountUpdate.parse(await c.req.json());
    const fields: Record<string, unknown> = {};
    if (body.name !== undefined) fields.name = body.name.trim() || 'OpenCode';
    if (body.workspace_id !== undefined) {
      fields.workspace_id = body.workspace_id.trim() || 'Default';
      fields.resolved_workspace_id = null;
    }
    if (body.auth_cookie !== undefined) fields.auth_cookie = body.auth_cookie.trim();
    if (body.show_rolling !== undefined) fields.show_rolling = body.show_rolling;
    if (body.show_weekly !== undefined) fields.show_weekly = body.show_weekly;
    if (body.show_monthly !== undefined) fields.show_monthly = body.show_monthly;
    if (body.enabled !== undefined) fields.enabled = body.enabled;
    const row = db.updateOpencodeAccount(accountId, fields);
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    return c.json(opencodeAccountDict(row));
  });

  app.delete('/api/accounts/opencode/:accountId', (c) => {
    if (!db.deleteOpencodeAccount(c.req.param('accountId'))) {
      return c.json({ detail: '账号不存在' }, 404);
    }
    return c.json({ ok: true });
  });

  app.post('/api/accounts/opencode/:accountId/test', async (c) => {
    const row = db.getOpencodeAccount(c.req.param('accountId'));
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    try {
      const workspaceId = await resolveAccountWorkspaceId(
        row.workspace_id,
        row.auth_cookie,
        row.resolved_workspace_id,
      );
      db.updateOpencodeAccount(row.id, { resolved_workspace_id: workspaceId });
      return c.json({ success: true, workspace_id: workspaceId });
    } catch (exc) {
      return c.json({ success: false, error: String(exc instanceof Error ? exc.message : exc) });
    }
  });

  app.get('/api/accounts/opencode/:accountId/quota', async (c) => {
    const row = db.getOpencodeAccount(c.req.param('accountId'));
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    const account: AccountConfig = {
      name: row.name,
      workspace_id: row.workspace_id,
      auth_cookie: row.auth_cookie,
      show_rolling: row.show_rolling,
      show_weekly: row.show_weekly,
      show_monthly: row.show_monthly,
    };
    const quota = await fetchQuotaForAccount(account, 0);
    return c.json(quotaAccountToDict(quota));
  });

  app.get('/api/accounts/opencode/:accountId/usage', (c) => {
    const accountId = c.req.param('accountId');
    if (!db.getOpencodeAccount(accountId)) return c.json({ detail: '账号不存在' }, 404);
    const offset = Math.max(0, Number(c.req.query('offset') || 0));
    const limit = Math.max(1, Math.min(Number(c.req.query('limit') || 50), 200));
    const keyId = c.req.query('key_id') || undefined;
    const [records, total] = db.listUsageRecords(accountId, {
      offset,
      limit,
      key_id: keyId,
    });
    const sync = db.getUsageSyncState(accountId);
    return c.json({
      records: records.map(db.usageRecordToDict),
      total,
      offset,
      limit,
      key_ids: db.listUsageKeyIds(accountId),
      sync: db.usageSyncStateToDict(sync),
    });
  });

  app.get('/api/accounts/opencode/:accountId/usage/status', (c) => {
    const accountId = c.req.param('accountId');
    if (!db.getOpencodeAccount(accountId)) return c.json({ detail: '账号不存在' }, 404);
    return c.json(db.usageSyncStateToDict(db.getUsageSyncState(accountId)));
  });

  app.post('/api/accounts/opencode/:accountId/usage/sync', async (c) => {
    const row = db.getOpencodeAccount(c.req.param('accountId'));
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    const pages = Math.max(1, Math.min(Number(c.req.query('pages') || 30), 100));
    try {
      const result = await syncUsage(row, pages);
      return c.json(syncResultToDict(result));
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 502);
    }
  });

  app.post('/api/accounts/opencode/:accountId/usage/backfill', async (c) => {
    const row = db.getOpencodeAccount(c.req.param('accountId'));
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    const pages = Math.max(1, Math.min(Number(c.req.query('pages') || 100), 1000));
    try {
      const result = await backfillUsage(row, pages);
      return c.json(syncResultToDict(result));
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 502);
    }
  });

  app.get('/api/accounts/opencode/:accountId/usage/progress', (c) => {
    const accountId = c.req.param('accountId');
    if (!db.getOpencodeAccount(accountId)) {
      return c.json({ status: 'idle', current: 0, total: 0, inserted: 0 });
    }
    return c.json(syncProgress.get(accountId));
  });

  app.get('/api/accounts/ollama', (c) => {
    return c.json(db.listOllamaAccounts().map(ollamaAccountDict));
  });

  app.post('/api/accounts/ollama', async (c) => {
    const body = OllamaAccountCreate.parse(await c.req.json());
    if (!body.session_cookie.trim()) {
      return c.json({ detail: 'session_cookie 不能为空' }, 400);
    }
    const row = db.createOllamaAccount({
      name: body.name.trim() || 'Ollama',
      session_cookie: body.session_cookie.trim(),
      show_session: body.show_session,
      show_weekly: body.show_weekly,
      enabled: body.enabled,
    });
    return c.json(ollamaAccountDict(row));
  });

  app.put('/api/accounts/ollama/:accountId', async (c) => {
    const body = OllamaAccountUpdate.parse(await c.req.json());
    const fields: Record<string, unknown> = {};
    if (body.name !== undefined) fields.name = body.name.trim() || 'Ollama';
    if (body.session_cookie !== undefined) fields.session_cookie = body.session_cookie.trim();
    if (body.show_session !== undefined) fields.show_session = body.show_session;
    if (body.show_weekly !== undefined) fields.show_weekly = body.show_weekly;
    if (body.enabled !== undefined) fields.enabled = body.enabled;
    const row = db.updateOllamaAccount(c.req.param('accountId'), fields);
    if (!row) return c.json({ detail: '账号不存在' }, 404);
    return c.json(ollamaAccountDict(row));
  });

  app.delete('/api/accounts/ollama/:accountId', (c) => {
    if (!db.deleteOllamaAccount(c.req.param('accountId'))) {
      return c.json({ detail: '账号不存在' }, 404);
    }
    return c.json({ ok: true });
  });

  app.get('/api/quota', async (c) => {
    try {
      loadServiceConfig();
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 500);
    }
    const rows = db.listOpencodeAccounts(true);
    if (!rows.length) return c.json([]);
    const accounts: AccountConfig[] = rows.map((row) => ({
      name: row.name,
      workspace_id: row.workspace_id,
      auth_cookie: row.auth_cookie,
      show_rolling: row.show_rolling,
      show_weekly: row.show_weekly,
      show_monthly: row.show_monthly,
    }));
    const results = await fetchAllQuotas(accounts);
    const idByName = Object.fromEntries(rows.map((r) => [r.name, r.id]));
    for (const item of results) {
      item.account_id = idByName[String(item.name ?? '')];
    }
    return c.json(results);
  });

  app.get('/api/ollama/quota', async (c) => {
    try {
      loadServiceConfig();
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 500);
    }
    const rows = db.listOllamaAccounts(true);
    if (!rows.length) return c.json([]);
    const accounts: OllamaAccountConfig[] = rows.map((row) => ({
      name: row.name,
      session_cookie: row.session_cookie,
      show_session: row.show_session,
      show_weekly: row.show_weekly,
    }));
    const results = await fetchAllOllamaQuotas(accounts);
    const idByName = Object.fromEntries(rows.map((r) => [r.name, r.id]));
    for (const item of results) {
      item.account_id = idByName[String(item.name ?? '')];
    }
    return c.json(results);
  });

  app.get('/api/dashboard', async (c) => {
    const period = c.req.query('period') || '30d';
    if (!/^(5h|7d|30d)$/.test(period)) {
      return c.json({ detail: 'invalid period' }, 400);
    }
    const [overview, quota] = await Promise.all([buildOverview(), fetchQuotaForDashboard()]);
    const [usageRecords, usageTotal] = db.listAllUsageRecords({ offset: 0, limit: 10 });
    const modelTokens = db.opencodeModelTokenStats(period);
    return c.json({
      overview,
      quota,
      recent_usage: {
        records: usageRecords.map(db.usageRecordWithAccountToDict),
        total: usageTotal,
      },
      model_tokens: modelTokens,
      period,
    });
  });

  app.get('/api/analytics/overview', async (c) => {
    try {
      return c.json(await buildOverview());
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 500);
    }
  });

  app.get('/api/analytics/opencode/daily', (c) => {
    const days = Math.max(1, Math.min(Number(c.req.query('days') || 30), 365));
    const accountId = c.req.query('account_id') || undefined;
    return c.json({ days, stats: db.opencodeDailyStats(days, accountId) });
  });

  app.get('/api/analytics/opencode/daily/models', (c) => {
    const days = Math.max(1, Math.min(Number(c.req.query('days') || 30), 365));
    const accountId = c.req.query('account_id') || undefined;
    return c.json({ days, stats: db.opencodeDailyModelStats(days, accountId) });
  });

  app.get('/api/analytics/opencode/model-tokens', (c) => {
    const days = Math.max(1, Math.min(Number(c.req.query('days') || 30), 365));
    const accountId = c.req.query('account_id') || undefined;
    const period = c.req.query('period');
    if (period && /^(5h|7d|30d)$/.test(period)) {
      return c.json({ days, stats: db.opencodeModelTokenStats(period, accountId) });
    }
    return c.json({ days, stats: db.opencodeModelTokenStats('30d', accountId) });
  });

  app.get('/api/usage/all', (c) => {
    const offset = Math.max(0, Number(c.req.query('offset') || 0));
    const limit = Math.max(1, Math.min(Number(c.req.query('limit') || 50), 500));
    const accountId = c.req.query('account_id') || undefined;
    const [records, total] = db.listAllUsageRecords({
      offset,
      limit: Math.min(limit, 200),
      account_id: accountId,
    });
    const accounts = db.listOpencodeAccounts();
    return c.json({
      records: records.map(db.usageRecordWithAccountToDict),
      total,
      offset,
      limit,
      accounts: accounts.map((row) => ({ id: row.id, name: row.name })),
    });
  });

  app.post('/api/config/reset', async (c) => {
    try {
      ensureBootstrapped();
      saveSettingsPayload({});
      opts.onConfigUpdated?.();
      return c.json(buildConfigResponse());
    } catch (exc) {
      return c.json({ detail: String(exc instanceof Error ? exc.message : exc) }, 500);
    }
  });

  return app;
}
