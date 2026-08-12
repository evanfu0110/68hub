import fs from 'fs';
import * as db from './db';
import {
  deepMerge,
  extractSettingsPayload,
  parseAccountsFromRaw,
  readOptionalConfigRaw,
  readOptionalRuntimeConfig,
  saveSettingsPayload,
} from './config';
import { encryptionAvailable, SECRET_PREFIX } from './secret-store';

export function ensureSettingsMigrated(): void {
  if (db.hasServiceSettings()) return;
  const legacy = deepMerge(readOptionalConfigRaw(), readOptionalRuntimeConfig());
  const payload = extractSettingsPayload(legacy);
  saveSettingsPayload(payload);
}

export function ensureAccountsImported(): void {
  const flag = db.importedFlagPath();
  if (fs.existsSync(flag)) return;
  if (db.countOpencodeAccounts() > 0 || db.countOllamaAccounts() > 0) {
    fs.writeFileSync(flag, 'imported\n', 'utf-8');
    return;
  }

  const raw = readOptionalConfigRaw();
  if (!raw || Object.keys(raw).length === 0) return;

  const [opencodeAccounts, ollamaAccounts] = parseAccountsFromRaw(raw);

  for (const account of opencodeAccounts) {
    if (!account.auth_cookie.trim()) continue;
    db.createOpencodeAccount({
      name: account.name,
      workspace_id: account.workspace_id,
      auth_cookie: account.auth_cookie,
      show_rolling: account.show_rolling,
      show_weekly: account.show_weekly,
      show_monthly: account.show_monthly,
    });
  }

  for (const account of ollamaAccounts) {
    if (!account.session_cookie.trim()) continue;
    db.createOllamaAccount({
      name: account.name,
      session_cookie: account.session_cookie,
      show_session: account.show_session,
      show_weekly: account.show_weekly,
    });
  }

  if (opencodeAccounts.length || ollamaAccounts.length) {
    fs.writeFileSync(flag, 'imported\n', 'utf-8');
  }
}

// One-time upgrade: encrypt cookies that predate safeStorage support.
// db accessors decrypt on read and encrypt on write, so the stored-value check
// must read raw columns (decrypted rows would never show the v1: prefix).
export function ensureSecretsEncrypted(): void {
  if (!encryptionAvailable()) return;
  const conn = db.getDb();
  const opencode = conn
    .prepare('SELECT id, auth_cookie FROM opencode_accounts')
    .all() as { id: string; auth_cookie: string }[];
  for (const row of opencode) {
    if (!row.auth_cookie || row.auth_cookie.startsWith(SECRET_PREFIX)) continue;
    db.updateOpencodeAccount(row.id, { auth_cookie: row.auth_cookie });
  }
  const ollama = conn
    .prepare('SELECT id, session_cookie FROM ollama_accounts')
    .all() as { id: string; session_cookie: string }[];
  for (const row of ollama) {
    if (!row.session_cookie || row.session_cookie.startsWith(SECRET_PREFIX)) continue;
    db.updateOllamaAccount(row.id, { session_cookie: row.session_cookie });
  }
}

export function ensureBootstrapped(): void {
  db.initDb();
  ensureSettingsMigrated();
  ensureAccountsImported();
  ensureSecretsEncrypted();
}
