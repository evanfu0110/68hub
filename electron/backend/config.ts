import fs from 'fs';
import path from 'path';

export const DEFAULT_USAGE_SERVER_ID =
  'bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c';

export const DEFAULT_LISTEN_HOST = '127.0.0.1';
export const DEFAULT_LISTEN_PORT = 8788;

export const DEFAULT_SETTINGS_PAYLOAD: Record<string, unknown> = {
  refresh: {
    ollama: { auto_refresh: true, interval_sec: 300 },
    opencode_go: { auto_refresh: true, interval_sec: 60 },
  },
  usage_sync: {
    auto_sync: true,
    interval_sec: 300,
    backfill_pages_per_request: 100,
    max_pages_per_incremental: 30,
  },
  opencode: {
    usage_server_id: DEFAULT_USAGE_SERVER_ID,
  },
};

export interface AccountConfig {
  name: string;
  workspace_id: string;
  auth_cookie: string;
  show_rolling?: boolean;
  show_weekly?: boolean;
  show_monthly?: boolean;
}

export interface OllamaAccountConfig {
  name: string;
  session_cookie: string;
  show_session?: boolean;
  show_weekly?: boolean;
}

export interface RefreshSettings {
  auto_refresh: boolean;
  interval_sec: number;
}

export interface OpenCodeSettings {
  usage_server_id: string;
}

export interface UsageSyncSettings {
  auto_sync: boolean;
  interval_sec: number;
  backfill_pages_per_request: number;
  max_pages_per_incremental: number;
}

export interface ServiceConfig {
  listen_host: string;
  listen_port: number;
  refresh_ollama: RefreshSettings;
  refresh_opencode_go: RefreshSettings;
  opencode: OpenCodeSettings;
  usage_sync: UsageSyncSettings;
}

let _dataDirOverride: string | null = null;

export function setDataDir(dir: string) {
  _dataDirOverride = dir;
}

export function dataDir(): string {
  if (_dataDirOverride) return path.resolve(_dataDirOverride);
  const envData = process.env['68BACKEND_DATA'];
  if (envData) return path.resolve(envData);
  const envPath = process.env['68BACKEND_CONFIG'];
  if (envPath) return path.dirname(path.resolve(envPath));
  return path.resolve(__dirname, '../../data');
}

export function legacyConfigPath(): string {
  const envPath = process.env['68BACKEND_CONFIG'];
  if (envPath) return path.resolve(envPath);
  return path.resolve(__dirname, '../../config.json');
}

export function legacyRuntimeConfigPath(): string {
  return path.join(dataDir(), 'service.json');
}

export function readOptionalJson(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function readOptionalConfigRaw(): Record<string, unknown> {
  return readOptionalJson(legacyConfigPath());
}

export function readOptionalRuntimeConfig(): Record<string, unknown> {
  return readOptionalJson(legacyRuntimeConfigPath());
}

export function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      merged[key] &&
      typeof merged[key] === 'object' &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = deepMerge(
        merged[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function extractSettingsPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (raw.refresh && typeof raw.refresh === 'object') payload.refresh = raw.refresh;
  if (raw.usage_sync && typeof raw.usage_sync === 'object') payload.usage_sync = raw.usage_sync;
  if (raw.opencode && typeof raw.opencode === 'object') payload.opencode = raw.opencode;
  return payload;
}

export function mergeSettingsWithDefaults(payload: Record<string, unknown>): Record<string, unknown> {
  return deepMerge(DEFAULT_SETTINGS_PAYLOAD, payload);
}

function parseRefreshSettings(
  raw: unknown,
  defaultInterval: number,
): RefreshSettings {
  if (!raw || typeof raw !== 'object') {
    return { auto_refresh: true, interval_sec: defaultInterval };
  }
  const obj = raw as Record<string, unknown>;
  let interval_sec = defaultInterval;
  try {
    interval_sec = Math.max(15, Number(obj.interval_sec ?? defaultInterval) || defaultInterval);
  } catch {
    interval_sec = defaultInterval;
  }
  return {
    auto_refresh: obj.auto_refresh !== false,
    interval_sec,
  };
}

function parseUsageSyncSettings(raw: unknown): UsageSyncSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      auto_sync: true,
      interval_sec: 300,
      backfill_pages_per_request: 100,
      max_pages_per_incremental: 10,
    };
  }
  const obj = raw as Record<string, unknown>;
  let interval_sec = 300;
  let backfill_pages = 100;
  let max_pages = 10;
  try {
    interval_sec = Math.max(15, Number(obj.interval_sec ?? 300) || 300);
  } catch {
    interval_sec = 300;
  }
  try {
    backfill_pages = Math.max(1, Math.min(Number(obj.backfill_pages_per_request ?? 100) || 100, 1000));
  } catch {
    backfill_pages = 5;
  }
  try {
    max_pages = Math.max(1, Math.min(Number(obj.max_pages_per_incremental ?? 10) || 10, 100));
  } catch {
    max_pages = 10;
  }
  return {
    auto_sync: obj.auto_sync !== false,
    interval_sec,
    backfill_pages_per_request: backfill_pages,
    max_pages_per_incremental: max_pages,
  };
}

function parseOpenCodeSettings(raw: unknown): OpenCodeSettings {
  if (!raw || typeof raw !== 'object') {
    return { usage_server_id: DEFAULT_USAGE_SERVER_ID };
  }
  const obj = raw as Record<string, unknown>;
  const server_id = String(obj.usage_server_id || DEFAULT_USAGE_SERVER_ID).trim();
  return { usage_server_id: server_id || DEFAULT_USAGE_SERVER_ID };
}

function listenSettingsFromLegacy(raw: Record<string, unknown>): [string, number] {
  const host = String(
    process.env['68BACKEND_LISTEN_HOST'] || raw.listen_host || DEFAULT_LISTEN_HOST,
  );
  const portRaw = process.env['68BACKEND_LISTEN_PORT'] || raw.listen_port || DEFAULT_LISTEN_PORT;
  let port = DEFAULT_LISTEN_PORT;
  try {
    port = Number(portRaw) || DEFAULT_LISTEN_PORT;
  } catch {
    port = DEFAULT_LISTEN_PORT;
  }
  return [host, port];
}

export function loadSettingsPayload(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('./db') as typeof import('./db');
  const stored = db.getServiceSettingsPayload();
  if (!stored || Object.keys(stored).length === 0) {
    return mergeSettingsWithDefaults({});
  }
  return mergeSettingsWithDefaults(stored);
}

export function saveSettingsPayload(payload: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const db = require('./db') as typeof import('./db');
  const merged = mergeSettingsWithDefaults(payload);
  db.saveServiceSettingsPayload(merged);
  return merged;
}

export function loadServiceConfig(): ServiceConfig {
  const legacy = deepMerge(readOptionalConfigRaw(), readOptionalRuntimeConfig());
  const settings = loadSettingsPayload();
  const refreshRaw =
    settings.refresh && typeof settings.refresh === 'object'
      ? (settings.refresh as Record<string, unknown>)
      : {};
  const [listen_host, listen_port] = listenSettingsFromLegacy(legacy);
  return {
    listen_host,
    listen_port,
    refresh_ollama: parseRefreshSettings(refreshRaw.ollama, 300),
    refresh_opencode_go: parseRefreshSettings(refreshRaw.opencode_go, 60),
    opencode: parseOpenCodeSettings(settings.opencode),
    usage_sync: parseUsageSyncSettings(settings.usage_sync),
  };
}

export function updateServiceConfig(updates: Record<string, unknown>): ServiceConfig {
  const current = loadSettingsPayload();
  const nextPayload: Record<string, unknown> = { ...current };

  const refreshUpdates = updates.refresh;
  if (refreshUpdates && typeof refreshUpdates === 'object') {
    const refreshRaw: Record<string, unknown> = {
      ...((nextPayload.refresh as Record<string, unknown>) || {}),
    };
    for (const [key, value] of Object.entries(refreshUpdates as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const section: Record<string, unknown> = {
        ...((refreshRaw[key] as Record<string, unknown>) || {}),
      };
      const v = value as Record<string, unknown>;
      if (v.auto_refresh !== undefined && v.auto_refresh !== null) {
        section.auto_refresh = Boolean(v.auto_refresh);
      }
      if (v.interval_sec !== undefined && v.interval_sec !== null) {
        section.interval_sec = Number(v.interval_sec);
      }
      refreshRaw[key] = section;
    }
    nextPayload.refresh = refreshRaw;
  }

  const usageSyncUpdates = updates.usage_sync;
  if (usageSyncUpdates && typeof usageSyncUpdates === 'object') {
    const section: Record<string, unknown> = {
      ...((nextPayload.usage_sync as Record<string, unknown>) || {}),
    };
    for (const field of [
      'auto_sync',
      'interval_sec',
      'backfill_pages_per_request',
      'max_pages_per_incremental',
    ] as const) {
      const v = (usageSyncUpdates as Record<string, unknown>)[field];
      if (v !== undefined && v !== null) section[field] = v;
    }
    nextPayload.usage_sync = section;
  }

  const opencodeUpdates = updates.opencode;
  if (opencodeUpdates && typeof opencodeUpdates === 'object') {
    const section: Record<string, unknown> = {
      ...((nextPayload.opencode as Record<string, unknown>) || {}),
    };
    const v = (opencodeUpdates as Record<string, unknown>).usage_server_id;
    if (v !== undefined && v !== null) {
      section.usage_server_id = String(v).trim();
    }
    nextPayload.opencode = section;
  }

  saveSettingsPayload(nextPayload);
  return loadServiceConfig();
}

export function parseAccountsFromRaw(
  raw: Record<string, unknown>,
): [AccountConfig[], OllamaAccountConfig[]] {
  let opencodeRaw: unknown[] = [];
  let ollamaRaw: unknown[] = [];
  const importBlock = raw.import_accounts;
  if (importBlock && typeof importBlock === 'object') {
    const ib = importBlock as Record<string, unknown>;
    opencodeRaw = (ib.opencode_accounts as unknown[]) || [];
    ollamaRaw = (ib.ollama_accounts as unknown[]) || [];
  } else {
    opencodeRaw = (raw.opencode_accounts as unknown[]) || [];
    ollamaRaw = (raw.ollama_accounts as unknown[]) || [];
  }

  const opencode_accounts: AccountConfig[] = [];
  opencodeRaw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    opencode_accounts.push({
      name: String(o.name || `opencode-${i + 1}`),
      workspace_id: String(o.workspace_id || 'Default').trim() || 'Default',
      auth_cookie: String(o.auth_cookie || '').trim(),
      show_rolling: o.show_rolling !== false,
      show_weekly: o.show_weekly !== false,
      show_monthly: o.show_monthly !== false,
    });
  });

  const ollama_accounts: OllamaAccountConfig[] = [];
  ollamaRaw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    ollama_accounts.push({
      name: String(o.name || `ollama-${i + 1}`),
      session_cookie: String(o.session_cookie || '').trim(),
      show_session: o.show_session !== false,
      show_weekly: o.show_weekly !== false,
    });
  });

  return [opencode_accounts, ollama_accounts];
}

function maskSecret(value: string, prefix: string): string {
  const secret = value.trim();
  if (secret.length <= 8) return `${prefix}****`;
  return `${prefix}${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export function maskCookie(cookie: string): string {
  let value = cookie.trim();
  if (!value) return '';
  if (value.toLowerCase().startsWith('cookie:')) value = value.slice(7).trim();
  let auth = value;
  if (value.includes('auth=')) {
    for (const part of value.split(';')) {
      const p = part.trim();
      if (p.startsWith('auth=')) {
        auth = p.slice(5);
        break;
      }
    }
  }
  return maskSecret(auth, 'auth=');
}

export function maskOllamaCookie(cookie: string): string {
  let value = cookie.trim();
  if (!value) return '';
  if (value.toLowerCase().startsWith('cookie:')) value = value.slice(7).trim();
  if (value.includes('__Secure-session=')) {
    for (const part of value.split(';')) {
      const p = part.trim();
      if (p.startsWith('__Secure-session=')) {
        return maskSecret(p.slice(17), '__Secure-session=');
      }
    }
  }
  if (!value.includes('=')) return maskSecret(value, '__Secure-session=');
  return 'cookie=****';
}
