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

export function ensureBootstrapped(): void {
  db.initDb();
  ensureSettingsMigrated();
  ensureAccountsImported();
}
