import * as db from './db';
import type { AccountConfig, OllamaAccountConfig } from './config';
import { fetchAllOllamaQuotas } from './ollama-quota';
import { LABEL_MONTHLY, LABEL_ROLLING, LABEL_WEEKLY, fetchAllQuotas } from './quota';

const LABEL_SESSION = 'Session';

export function planMultiplier(plan: string): number {
  return plan.toLowerCase().includes('max') ? 5 : 1;
}

function windowByLabel(
  windows: Record<string, unknown>[],
  label: string,
): Record<string, unknown> | null {
  for (const window of windows) {
    if (window.label === label) return window;
  }
  return null;
}

export function applyOpencodeCascade(
  windows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const monthly = windowByLabel(windows, LABEL_MONTHLY);
  const weekly = windowByLabel(windows, LABEL_WEEKLY);

  const monthlyFull = monthly != null && Number(monthly.used ?? 0) >= 100;
  const weeklyFull = weekly != null && Number(weekly.used ?? 0) >= 100;

  return windows.map((window) => {
    const item = { ...window };
    const label = String(item.label ?? '');
    let blocked = false;
    let blockedBy = '';
    if (label === LABEL_WEEKLY && monthlyFull) {
      blocked = true;
      blockedBy = LABEL_MONTHLY;
    } else if (label === LABEL_ROLLING && (monthlyFull || weeklyFull)) {
      blocked = true;
      blockedBy = monthlyFull ? LABEL_MONTHLY : LABEL_WEEKLY;
    }
    if (blocked) {
      item.blocked = true;
      item.blocked_by = blockedBy;
      item.effective_remaining = 0.0;
    } else {
      item.blocked = false;
      item.effective_remaining = Number(item.remaining ?? 0);
    }
    return item;
  });
}

export function opencodeEffectiveRemaining(windows: Record<string, unknown>[]): number {
  const cascaded = applyOpencodeCascade(windows);
  const rolling = windowByLabel(cascaded, LABEL_ROLLING);
  if (rolling != null) return Number(rolling.effective_remaining ?? 0);
  const weekly = windowByLabel(cascaded, LABEL_WEEKLY);
  if (weekly != null) return Number(weekly.effective_remaining ?? 0);
  const monthly = windowByLabel(cascaded, LABEL_MONTHLY);
  if (monthly != null) return Number(monthly.effective_remaining ?? 0);
  return 0.0;
}

export function ollamaAccountProStats(account: Record<string, unknown>): Record<string, unknown> {
  const plan = String(account.plan || '');
  const multiplier = planMultiplier(plan);
  let session: Record<string, unknown> | null = null;
  for (const window of (account.windows as Record<string, unknown>[]) || []) {
    if (window.label === LABEL_SESSION) {
      session = window;
      break;
    }
  }
  const remainingPct = session ? Number(session.remaining ?? 0) : 0.0;
  const remainingPro = (remainingPct / 100.0) * multiplier;
  return {
    account_id: account.account_id,
    name: account.name,
    plan,
    multiplier,
    remaining_pro: Math.round(remainingPro * 100) / 100,
    capacity_pro: multiplier,
    success: account.success ?? false,
  };
}

export function aggregateOllama(accounts: Record<string, unknown>[]): Record<string, unknown> {
  const perAccount = accounts.map(ollamaAccountProStats);
  const successful = perAccount.filter((a) => a.success);
  const totalRemaining =
    Math.round(successful.reduce((s, a) => s + Number(a.remaining_pro), 0) * 100) / 100;
  const totalCapacity =
    Math.round(successful.reduce((s, a) => s + Number(a.capacity_pro), 0) * 100) / 100;
  return {
    total_remaining_pro: totalRemaining,
    total_capacity_pro: totalCapacity,
    account_count: accounts.length,
    success_count: successful.length,
    accounts: perAccount,
  };
}

export function aggregateOpencode(accounts: Record<string, unknown>[]): Record<string, unknown> {
  const perAccount: Record<string, unknown>[] = [];
  const effectiveValues: number[] = [];
  let blockedCount = 0;

  for (const account of accounts) {
    const windows = (account.windows as Record<string, unknown>[]) || [];
    const cascaded = applyOpencodeCascade(windows);
    const effective = opencodeEffectiveRemaining(windows);
    const isBlocked = effective <= 0 && Boolean(account.success);
    if (isBlocked) blockedCount += 1;
    if (account.success) effectiveValues.push(effective);
    perAccount.push({
      account_id: account.account_id,
      name: account.name,
      success: account.success ?? false,
      effective_remaining: Math.round(effective * 10) / 10,
      blocked: isBlocked,
      windows: cascaded,
    });
  }

  const avgEffective =
    effectiveValues.length > 0
      ? Math.round(
          (effectiveValues.reduce((a, b) => a + b, 0) / effectiveValues.length) * 10,
        ) / 10
      : 0.0;

  return {
    avg_effective_remaining: avgEffective,
    account_count: accounts.length,
    success_count: effectiveValues.length,
    blocked_count: blockedCount,
    accounts: perAccount,
  };
}

export function aggregateOllamaModels(
  accounts: Record<string, unknown>[],
): Record<string, unknown>[] {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    if (!account.success) continue;
    for (const window of (account.windows as Record<string, unknown>[]) || []) {
      if (window.label !== LABEL_SESSION && window.label !== 'Weekly') continue;
      for (const model of (window.models as Record<string, unknown>[]) || []) {
        const name = String(model.model || '');
        if (!name) continue;
        totals.set(name, (totals.get(name) || 0) + Number(model.requests || 0));
      }
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model, requests]) => ({ model, requests }));
}

export async function buildOverview(): Promise<Record<string, unknown>> {
  const opencodeRows = db.listOpencodeAccounts(true);
  const ollamaRows = db.listOllamaAccounts(true);

  const opencodeAccountsCfg: AccountConfig[] = opencodeRows.map((row) => ({
    name: row.name,
    workspace_id: row.workspace_id,
    auth_cookie: row.auth_cookie,
    show_rolling: row.show_rolling,
    show_weekly: row.show_weekly,
    show_monthly: row.show_monthly,
  }));
  const ollamaAccountsCfg: OllamaAccountConfig[] = ollamaRows.map((row) => ({
    name: row.name,
    session_cookie: row.session_cookie,
    show_session: row.show_session,
    show_weekly: row.show_weekly,
  }));

  const opencodeQuotas = opencodeAccountsCfg.length
    ? await fetchAllQuotas(opencodeAccountsCfg)
    : [];
  const ollamaQuotas = ollamaAccountsCfg.length
    ? await fetchAllOllamaQuotas(ollamaAccountsCfg)
    : [];

  const opencodeIdByName = Object.fromEntries(opencodeRows.map((r) => [r.name, r.id]));
  const ollamaIdByName = Object.fromEntries(ollamaRows.map((r) => [r.name, r.id]));
  for (const item of opencodeQuotas) {
    item.account_id = opencodeIdByName[String(item.name ?? '')];
  }
  for (const item of ollamaQuotas) {
    item.account_id = ollamaIdByName[String(item.name ?? '')];
  }

  return {
    ollama: aggregateOllama(ollamaQuotas),
    opencode: aggregateOpencode(opencodeQuotas),
    ollama_models: aggregateOllamaModels(ollamaQuotas),
  };
}
