import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { getRequestListener } from '@hono/node-server';
import { createApp } from './routes';
import { ensureBootstrapped } from './bootstrap';
import { loadServiceConfig, setDataDir } from './config';
import * as db from './db';
import { syncUsage } from './usage-sync';
import { closeDb } from './db';

export interface BackendOptions {
  host?: string;
  port?: number;
  dataDir?: string;
}

let server: Server | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncRunning = false;
let stopped = false;

function clearSyncTimer() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

async function runAutoSyncOnce() {
  if (syncRunning || stopped) return;
  syncRunning = true;
  try {
    const service = loadServiceConfig();
    if (!service.usage_sync.auto_sync) return;
    const accounts = db.listOpencodeAccounts(true);
    for (const account of accounts) {
      if (stopped) break;
      try {
        await syncUsage(account, 5);
      } catch {
        // ignore per-account errors
      }
    }
  } finally {
    syncRunning = false;
  }
}

function scheduleAutoSync() {
  clearSyncTimer();
  if (stopped) return;
  const service = loadServiceConfig();
  if (!service.usage_sync.auto_sync) {
    // recheck later
    syncTimer = setTimeout(() => {
      scheduleAutoSync();
    }, 30_000);
    return;
  }
  const intervalMs = Math.max(15, service.usage_sync.interval_sec) * 1000;
  syncTimer = setTimeout(async () => {
    await runAutoSyncOnce();
    scheduleAutoSync();
  }, intervalMs);
}

export function restartUsageSyncTask() {
  clearSyncTimer();
  if (stopped) return;
  const service = loadServiceConfig();
  if (service.usage_sync.auto_sync) {
    // kick soon, then continue on interval
    syncTimer = setTimeout(async () => {
      await runAutoSyncOnce();
      scheduleAutoSync();
    }, 1000);
  } else {
    scheduleAutoSync();
  }
}

export async function startBackendServer(opts: BackendOptions = {}): Promise<{
  host: string;
  port: number;
}> {
  if (server) {
    const addr = server.address() as AddressInfo | null;
    return {
      host: opts.host || '127.0.0.1',
      port: addr?.port ?? opts.port ?? 8788,
    };
  }

  stopped = false;
  if (opts.dataDir) setDataDir(opts.dataDir);

  ensureBootstrapped();

  const service = loadServiceConfig();
  const host = opts.host || service.listen_host || '127.0.0.1';
  const port = opts.port ?? service.listen_port ?? 8788;

  const app = createApp({ onConfigUpdated: restartUsageSyncTask });
  const listener = getRequestListener(app.fetch);

  server = createServer(listener);

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(port, host, () => {
      server!.off('error', reject);
      resolve();
    });
  });

  restartUsageSyncTask();
  console.log(`[backend] listening on http://${host}:${port}`);
  return { host, port };
}

export async function stopBackendServer(): Promise<void> {
  stopped = true;
  clearSyncTimer();
  if (!server) {
    closeDb();
    return;
  }
  const s = server;
  server = null;
  await new Promise<void>((resolve) => {
    s.close(() => resolve());
    // force close hang connections
    setTimeout(() => resolve(), 2000);
  });
  closeDb();
  console.log('[backend] stopped');
}

export async function restartBackendServer(opts: BackendOptions = {}): Promise<boolean> {
  await stopBackendServer();
  await startBackendServer(opts);
  return true;
}

export function isBackendRunning(): boolean {
  return server != null && server.listening;
}
