import type { AccountConfig } from './config';

const DASHBOARD_BASE = 'https://opencode.ai/workspace';
const WORKSPACE_SERVER_ID = 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f';
const DEFAULT_WORKSPACE_ID = 'Default';
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0';
const TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 4 << 20;

export const LABEL_ROLLING = '5h Rolling';
export const LABEL_WEEKLY = 'Weekly';
export const LABEL_MONTHLY = 'Monthly';

const RE_ROLLING_PCT_FIRST =
  /rollingUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}/;
const RE_ROLLING_RESET_FIRST =
  /rollingUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}/;
const RE_WEEKLY_PCT_FIRST =
  /weeklyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}/;
const RE_WEEKLY_RESET_FIRST =
  /weeklyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}/;
const RE_MONTHLY_PCT_FIRST =
  /monthlyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}/;
const RE_MONTHLY_RESET_FIRST =
  /monthlyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}/;
const RE_WORKSPACE_ID = /wrk_[A-Za-z0-9]+/;
const RE_WORKSPACE_ENTRY = /id\s*:\s*"(wrk_[^"]+)"[^{}]*?name\s*:\s*"([^"]*)"/gs;

export interface QuotaWindow {
  label: string;
  used: number;
  remaining: number;
  total: number;
  unit: string;
  reset_at: string;
  reset_in_sec: number;
}

export interface QuotaAccount {
  index: number;
  name: string;
  workspace_id: string;
  success: boolean;
  updated_at: string;
  windows: QuotaWindow[];
  error?: string;
}

function quotaWindowToDict(w: QuotaWindow): Record<string, unknown> {
  return {
    label: w.label,
    used: w.used,
    remaining: w.remaining,
    total: w.total,
    unit: w.unit,
    reset_at: w.reset_at,
    reset_in_sec: w.reset_in_sec,
  };
}

export function quotaAccountToDict(a: QuotaAccount): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    index: a.index,
    name: a.name,
    workspace_id: a.workspace_id,
    success: a.success,
    updated_at: a.updated_at,
  };
  if (a.error) payload.error = a.error;
  if (a.windows.length) payload.windows = a.windows.map(quotaWindowToDict);
  return payload;
}

export function buildCookieHeader(authCookie: string): string {
  let cookie = authCookie.trim();
  if (cookie.toLowerCase().startsWith('cookie:')) cookie = cookie.slice(7).trim();
  if (!cookie) return '';
  for (const part of cookie.split(';')) {
    const p = part.trim();
    if (p.startsWith('auth=')) return p;
  }
  return `auth=${cookie}`;
}

export function extractWorkspaceId(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('wrk_') && value.length > 4) return value;
  const match = RE_WORKSPACE_ID.exec(value);
  return match ? match[0] : '';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWorkspaceRefs(
  authCookie: string,
): Promise<[string, string][]> {
  const cookieHeader = buildCookieHeader(authCookie);
  if (!cookieHeader) throw new Error('OpenCode Go auth cookie 为空');

  const url = `https://opencode.ai/_server?id=${encodeURIComponent(WORKSPACE_SERVER_ID)}`;
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    'X-Server-Id': WORKSPACE_SERVER_ID,
    'X-Server-Instance': `server-fn:${Date.now() * 1e6}`,
    'User-Agent': USER_AGENT,
    Origin: 'https://opencode.ai',
    Referer: 'https://opencode.ai',
    Accept: 'text/javascript, application/json;q=0.9, */*;q=0.8',
  };
  const resp = await fetchWithTimeout(url, { headers, redirect: 'manual' });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`认证失败 (HTTP ${resp.status})，请检查 auth cookie`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`工作区查询返回 HTTP ${resp.status}`);
  }

  const text = (await resp.text()).slice(0, MAX_HTML_BYTES);
  const refs: [string, string][] = [];
  const seen = new Set<string>();
  RE_WORKSPACE_ENTRY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_WORKSPACE_ENTRY.exec(text)) !== null) {
    const workspaceId = m[1];
    const name = m[2].trim();
    if (seen.has(workspaceId)) continue;
    seen.add(workspaceId);
    refs.push([workspaceId, name]);
  }
  if (!refs.length) throw new Error('无法从账号数据解析工作区 ID');
  return refs;
}

export async function resolveWorkspaceId(
  workspaceHint: string,
  authCookie: string,
): Promise<string> {
  const resolved = extractWorkspaceId(workspaceHint);
  if (resolved) return resolved;

  const refs = await fetchWorkspaceRefs(authCookie);
  const hint = workspaceHint.trim();
  if (hint) {
    for (const [workspaceId, name] of refs) {
      if (
        workspaceId.toLowerCase() === hint.toLowerCase() ||
        name.toLowerCase() === hint.toLowerCase()
      ) {
        return workspaceId;
      }
    }
  }
  if (refs.length) return refs[0][0];
  if (hint) throw new Error(`无法从 "${hint}" 解析工作区 ID`);
  throw new Error('无法解析 OpenCode Go 工作区 ID');
}

function parseWindow(
  pctFirst: RegExp,
  resetFirst: RegExp,
  html: string,
): [number, number] | null {
  let match = pctFirst.exec(html);
  if (match) return [parseFloat(match[1]), Math.trunc(parseFloat(match[2]))];
  match = resetFirst.exec(html);
  if (match) return [parseFloat(match[2]), Math.trunc(parseFloat(match[1]))];
  return null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizeWindow(
  label: string,
  usagePercent: number,
  resetInSec: number,
  now: Date,
): QuotaWindow {
  const used = clampPercent(usagePercent);
  const resetAt = new Date(now.getTime() + resetInSec * 1000);
  return {
    label,
    used,
    remaining: 100.0 - used,
    total: 100.0,
    unit: '%',
    reset_at: resetAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    reset_in_sec: resetInSec,
  };
}

export function parseQuotaHtml(html: string, now: Date): QuotaWindow[] {
  const windows: QuotaWindow[] = [];
  const pairs: [string, RegExp, RegExp][] = [
    [LABEL_ROLLING, RE_ROLLING_PCT_FIRST, RE_ROLLING_RESET_FIRST],
    [LABEL_WEEKLY, RE_WEEKLY_PCT_FIRST, RE_WEEKLY_RESET_FIRST],
    [LABEL_MONTHLY, RE_MONTHLY_PCT_FIRST, RE_MONTHLY_RESET_FIRST],
  ];
  for (const [label, pctRe, resetRe] of pairs) {
    const parsed = parseWindow(pctRe, resetRe, html);
    if (parsed) windows.push(normalizeWindow(label, parsed[0], parsed[1], now));
  }
  return windows;
}

function filterWindows(windows: QuotaWindow[], account: AccountConfig): QuotaWindow[] {
  return windows.filter((window) => {
    if (window.label === LABEL_ROLLING && account.show_rolling === false) return false;
    if (window.label === LABEL_WEEKLY && account.show_weekly === false) return false;
    if (window.label === LABEL_MONTHLY && account.show_monthly === false) return false;
    return true;
  });
}

export async function fetchQuotaForAccount(
  account: AccountConfig,
  index: number,
): Promise<QuotaAccount> {
  const now = new Date();
  const updatedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const workspaceHint =
    (account.workspace_id || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;

  if (!account.auth_cookie.trim()) {
    return {
      index,
      name: account.name,
      workspace_id: workspaceHint,
      success: false,
      updated_at: updatedAt,
      windows: [],
      error: '未配置 auth_cookie',
    };
  }

  try {
    const resolvedId = await resolveWorkspaceId(workspaceHint, account.auth_cookie);
    const cookieHeader = buildCookieHeader(account.auth_cookie);
    if (!cookieHeader) throw new Error('OpenCode Go auth cookie 为空');

    const dashboardUrl = `${DASHBOARD_BASE.replace(/\/$/, '')}/${encodeURIComponent(resolvedId)}/go`;
    const resp = await fetchWithTimeout(dashboardUrl, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': USER_AGENT,
        Accept: 'text/html, application/xhtml+xml',
      },
      redirect: 'manual',
    });

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('Location') || '';
      if (location) {
        throw new Error(
          `Dashboard 重定向 (HTTP ${resp.status} → ${location})，请检查 workspace_id 与 cookie`,
        );
      }
      throw new Error(
        `Dashboard 重定向 (HTTP ${resp.status})，请检查 workspace_id 与 cookie`,
      );
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`认证失败 (HTTP ${resp.status})，请检查 auth cookie`);
    }
    if (resp.status === 404) {
      throw new Error('工作区不存在 (HTTP 404)，请确认 workspace_id');
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Dashboard 返回 HTTP ${resp.status}`);
    }

    const html = (await resp.text()).slice(0, MAX_HTML_BYTES);
    const windows = parseQuotaHtml(html, now);
    if (!windows.length) throw new Error('无法从 Dashboard HTML 解析额度数据');

    return {
      index,
      name: account.name,
      workspace_id: resolvedId,
      success: true,
      updated_at: updatedAt,
      windows: filterWindows(windows, account),
    };
  } catch (exc) {
    return {
      index,
      name: account.name,
      workspace_id: workspaceHint,
      success: false,
      updated_at: updatedAt,
      windows: [],
      error: String(exc instanceof Error ? exc.message : exc),
    };
  }
}

const quotaCache = new Map<string, [number, Record<string, unknown>[]]>();
const QUOTA_CACHE_TTL = 15.0;

export async function fetchAllQuotas(
  accounts: AccountConfig[],
): Promise<Record<string, unknown>[]> {
  const now = Date.now() / 1000;
  const cacheKey = accounts.map((a) => `${a.name}:${a.workspace_id}`).join('|');
  const cached = quotaCache.get(cacheKey);
  if (cached && now - cached[0] < QUOTA_CACHE_TTL) return cached[1];

  const results = await Promise.all(
    accounts.map((account, i) => fetchQuotaForAccount(account, i)),
  );
  const dicts = results.map(quotaAccountToDict);
  quotaCache.set(cacheKey, [now, dicts]);
  return dicts;
}
