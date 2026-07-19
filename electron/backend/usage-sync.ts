import * as db from './db';
import type { OpenCodeAccountRow } from './db';
import * as syncProgress from './sync-progress';
import { loadServiceConfig } from './config';
import {
  USAGE_PAGE_SIZE,
  fetchUsagePage,
  resolveAccountWorkspaceId,
  toDbDict,
  type ParsedUsageRecord,
} from './opencode-usage';

const BATCH_SIZE = 5;

export interface SyncResult {
  inserted: number;
  pages_fetched: number;
  sync_at: string;
  error?: string;
}

export function syncResultToDict(r: SyncResult): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    inserted: r.inserted,
    pages_fetched: r.pages_fetched,
    sync_at: r.sync_at,
  };
  if (r.error) payload.error = r.error;
  return payload;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function ensureWorkspace(account: OpenCodeAccountRow): Promise<string> {
  const workspaceId = await resolveAccountWorkspaceId(
    account.workspace_id,
    account.auth_cookie,
    account.resolved_workspace_id,
  );
  if (workspaceId !== account.resolved_workspace_id) {
    db.updateOpencodeAccount(account.id, { resolved_workspace_id: workspaceId });
  }
  return workspaceId;
}

async function fetchAndInsertBatch(
  account: OpenCodeAccountRow,
  workspaceId: string,
  pages: number[],
  insertedTotal: number,
): Promise<[number, number, number]> {
  const results = await Promise.all(
    pages.map((p) =>
      fetchUsagePage({
        workspace_id: workspaceId,
        auth_cookie: account.auth_cookie,
        page: p,
      }).then(
        (r) => r as ParsedUsageRecord[] | Error,
        (e) => e as Error,
      ),
    ),
  );

  let newInserted = 0;
  let pagesDone = 0;
  let total = insertedTotal;

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const result = results[i];
    if (result instanceof Error) continue;
    const records = result;
    if (!records.length) continue;
    pagesDone += 1;
    const newInPage = db.insertUsageRecordsIgnore(
      account.id,
      workspaceId,
      records.map(toDbDict),
    );
    newInserted += newInPage;
    total += newInPage;
    syncProgress.update(account.id, p + 1, total);
    if (records.length < USAGE_PAGE_SIZE) {
      return [newInserted, pagesDone, -1];
    }
  }

  if (pagesDone === 0) return [newInserted, pagesDone, -1];
  return [newInserted, pagesDone, 0];
}

export async function syncUsage(
  account: OpenCodeAccountRow,
  maxPages?: number | null,
): Promise<SyncResult> {
  const cfg = loadServiceConfig().usage_sync;
  let pagesLimit = maxPages != null ? maxPages : cfg.max_pages_per_incremental;
  pagesLimit = Math.max(1, Math.min(pagesLimit, 1000));
  const syncAt = nowIso();
  let insertedTotal = 0;
  let pagesFetched = 0;

  try {
    const workspaceId = await ensureWorkspace(account);
    const state = db.getUsageSyncState(account.id);
    let deepest = state.deepest_page_fetched;

    if (deepest >= 0) {
      for (let p = 0; p < Math.min(deepest + 1, 20); p++) {
        const records = await fetchUsagePage({
          workspace_id: workspaceId,
          auth_cookie: account.auth_cookie,
          page: p,
        });
        if (!records.length) break;
        pagesFetched += 1;
        const newInPage = db.insertUsageRecordsIgnore(
          account.id,
          workspaceId,
          records.map(toDbDict),
        );
        insertedTotal += newInPage;
        if (newInPage === 0) break;
        if (records.length < USAGE_PAGE_SIZE) break;
      }
    }

    const startPage = Math.max(0, deepest + 1);
    let page = startPage;
    syncProgress.start(account.id, pagesLimit);

    while (page - startPage < pagesLimit) {
      const remaining = pagesLimit - (page - startPage);
      const batchSize = Math.min(BATCH_SIZE, remaining);
      const batchPages = Array.from({ length: batchSize }, (_, i) => page + i);

      const [newInserted, pagesDone, stopSignal] = await fetchAndInsertBatch(
        account,
        workspaceId,
        batchPages,
        insertedTotal,
      );
      insertedTotal += newInserted;
      pagesFetched += pagesDone;
      page += batchSize;
      if (stopSignal < 0) break;
    }

    deepest = pagesFetched ? Math.max(deepest, page - 1) : deepest;
    db.updateUsageSyncState(account.id, {
      last_sync_at: syncAt,
      last_sync_status: 'ok',
      last_sync_error: null,
      last_inserted_count: insertedTotal,
      deepest_page_fetched: deepest,
    });
    db.refreshUsageSyncTotals(account.id);
    syncProgress.finish(account.id, insertedTotal);
    return { inserted: insertedTotal, pages_fetched: pagesFetched, sync_at: syncAt };
  } catch (exc) {
    const msg = String(exc instanceof Error ? exc.message : exc);
    syncProgress.error(account.id, msg);
    db.updateUsageSyncState(account.id, {
      last_sync_at: syncAt,
      last_sync_status: 'error',
      last_sync_error: msg,
      last_inserted_count: 0,
    });
    throw exc;
  }
}

export async function backfillUsage(
  account: OpenCodeAccountRow,
  maxPages?: number | null,
): Promise<SyncResult> {
  const cfg = loadServiceConfig().usage_sync;
  let pagesLimit = maxPages != null ? maxPages : cfg.backfill_pages_per_request;
  pagesLimit = Math.max(1, Math.min(pagesLimit, 1000));
  const syncAt = nowIso();
  let insertedTotal = 0;
  let pagesFetched = 0;

  try {
    const workspaceId = await ensureWorkspace(account);
    const state = db.getUsageSyncState(account.id);
    const startPage = state.deepest_page_fetched >= 0 ? state.deepest_page_fetched + 1 : 0;
    let page = startPage;

    syncProgress.start(account.id, pagesLimit);

    while (page - startPage < pagesLimit) {
      const remaining = pagesLimit - (page - startPage);
      const batchSize = Math.min(BATCH_SIZE, remaining);
      const batchPages = Array.from({ length: batchSize }, (_, i) => page + i);

      const [newInserted, pagesDone, stopSignal] = await fetchAndInsertBatch(
        account,
        workspaceId,
        batchPages,
        insertedTotal,
      );
      insertedTotal += newInserted;
      pagesFetched += pagesDone;
      page += batchSize;

      for (const p of batchPages.slice(0, pagesDone)) {
        db.updateUsageSyncState(account.id, { deepest_page_fetched: p });
      }

      if (stopSignal < 0) break;
    }

    db.refreshUsageSyncTotals(account.id);
    db.updateUsageSyncState(account.id, {
      last_sync_at: syncAt,
      last_sync_status: 'ok',
      last_sync_error: null,
      last_inserted_count: insertedTotal,
    });
    syncProgress.finish(account.id, insertedTotal);
    return { inserted: insertedTotal, pages_fetched: pagesFetched, sync_at: syncAt };
  } catch (exc) {
    const msg = String(exc instanceof Error ? exc.message : exc);
    syncProgress.error(account.id, msg);
    db.updateUsageSyncState(account.id, {
      last_sync_at: syncAt,
      last_sync_status: 'error',
      last_sync_error: msg,
      last_inserted_count: 0,
    });
    throw exc;
  }
}
