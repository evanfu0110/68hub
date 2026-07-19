import type { OllamaAccountConfig } from './config';

const SETTINGS_URL = 'https://ollama.com/settings';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 20000;
const MAX_HTML_BYTES = 4 << 20;

const LABEL_SESSION = 'Session';
const LABEL_WEEKLY = 'Weekly';

interface OllamaModelUsage {
  model: string;
  requests: number;
  share_percent?: number | null;
}

interface OllamaQuotaWindow {
  label: string;
  used: number;
  remaining: number;
  total: number;
  unit: string;
  reset_at: string;
  reset_in_sec: number;
  status_text?: string;
  models?: OllamaModelUsage[] | null;
}

interface OllamaQuotaAccount {
  index: number;
  name: string;
  success: boolean;
  updated_at: string;
  plan?: string;
  windows?: OllamaQuotaWindow[] | null;
  error?: string;
}

function modelToDict(m: OllamaModelUsage): Record<string, unknown> {
  const payload: Record<string, unknown> = { model: m.model, requests: m.requests };
  if (m.share_percent != null) payload.share_percent = m.share_percent;
  return payload;
}

function windowToDict(w: OllamaQuotaWindow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    label: w.label,
    used: w.used,
    remaining: w.remaining,
    total: w.total,
    unit: w.unit,
    reset_at: w.reset_at,
    reset_in_sec: w.reset_in_sec,
  };
  if (w.status_text) payload.status_text = w.status_text;
  if (w.models?.length) payload.models = w.models.map(modelToDict);
  return payload;
}

function accountToDict(a: OllamaQuotaAccount): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    index: a.index,
    name: a.name,
    success: a.success,
    updated_at: a.updated_at,
  };
  if (a.plan) payload.plan = a.plan;
  if (a.error) payload.error = a.error;
  if (a.windows?.length) payload.windows = a.windows.map(windowToDict);
  return payload;
}

export function buildOllamaCookieHeader(sessionCookie: string): string {
  let cookie = sessionCookie.trim();
  if (cookie.toLowerCase().startsWith('cookie:')) cookie = cookie.slice(7).trim();
  if (!cookie) return '';
  if (!cookie.includes('=')) return `__Secure-session=${cookie}`;
  return cookie.replace(/;+$/, '');
}

function extractCloudUsageBlock(html: string): string {
  const match = html.match(
    /<span>Cloud usage<\/span>(.*?)<\/div>\s*<script>/is,
  );
  if (!match) {
    throw new Error('页面中未找到 Cloud usage 区块（可能未登录或页面结构已变更）');
  }
  return match[1];
}

function parsePlan(block: string): string {
  const match = block.match(/rounded-full[^>]*capitalize[^>]*>\s*([^<]+?)\s*<\/span/i);
  return match ? match[1].trim() : '';
}

function parsePercentFromAria(ariaLabel: string): number | null {
  const match = ariaLabel.match(/(\d+(?:\.\d+)?)\s*%\s*used/i);
  return match ? parseFloat(match[1]) : null;
}

function parseUsageTracks(block: string): {
  aria_label: string;
  used_percent: number | null;
  models: OllamaModelUsage[];
}[] {
  const tracks: {
    aria_label: string;
    used_percent: number | null;
    models: OllamaModelUsage[];
  }[] = [];
  const trackRe = /data-usage-track[^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/div>/gis;
  let trackMatch: RegExpExecArray | null;
  while ((trackMatch = trackRe.exec(block)) !== null) {
    const ariaLabel = trackMatch[1];
    const inner = trackMatch[2];
    const models: OllamaModelUsage[] = [];
    const segRe = /<button\b[^>]*data-usage-segment[^>]*>/gi;
    let seg: RegExpExecArray | null;
    while ((seg = segRe.exec(inner)) !== null) {
      const tag = seg[0];
      const modelMatch = tag.match(/data-model="([^"]+)"/);
      const requestsMatch = tag.match(/data-requests="(\d+)"/);
      const widthMatch = tag.match(/width:\s*([\d.]+)%/);
      if (!modelMatch || !requestsMatch) continue;
      models.push({
        model: modelMatch[1],
        requests: parseInt(requestsMatch[1], 10),
        share_percent: widthMatch ? parseFloat(widthMatch[1]) : null,
      });
    }
    tracks.push({
      aria_label: ariaLabel,
      used_percent: parsePercentFromAria(ariaLabel),
      models,
    });
  }
  return tracks;
}

function parsePeriodHeaders(block: string): (string | null)[] {
  const headers: (string | null)[] = [];
  const sectionRe = /<div class="flex justify-between mb-2">(.*?)<\/div>/gs;
  let section: RegExpExecArray | null;
  while ((section = sectionRe.exec(block)) !== null) {
    const spans = [...section[1].matchAll(/<span class="text-sm[^"]*"[^>]*>\s*([^<]+?)\s*<\/span/gs)];
    if (spans.length >= 2) headers.push(spans[1][1].trim());
    if (headers.length >= 2) break;
  }
  while (headers.length < 2) headers.push(null);
  return headers.slice(0, 2);
}

function parseResetInfo(block: string): [string | null, string | null][] {
  const resets: [string | null, string | null][] = [];
  const re =
    /class="[^"]*local-time[^"]*"[^>]*data-time="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/div>/gi;
  let item: RegExpExecArray | null;
  while ((item = re.exec(block)) !== null) {
    resets.push([item[1], item[2].trim()]);
  }
  while (resets.length < 2) resets.push([null, null]);
  return resets.slice(0, 2);
}

function parseResetAt(value: string | null): Date | null {
  if (!value) return null;
  let text = value.trim();
  if (text.endsWith('Z')) text = text.slice(0, -1) + '+00:00';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function buildWindow(
  label: string,
  usedPercent: number | null | undefined,
  statusText: string | null | undefined,
  resetAtRaw: string | null,
  models: OllamaModelUsage[],
  now: Date,
): OllamaQuotaWindow | null {
  if (usedPercent == null) return null;
  const used = clampPercent(usedPercent);
  const resetAtDt = parseResetAt(resetAtRaw);
  let resetInSec = 0;
  let resetAt = '';
  if (resetAtDt) {
    resetInSec = Math.max(0, Math.trunc((resetAtDt.getTime() - now.getTime()) / 1000));
    resetAt = resetAtDt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return {
    label,
    used,
    remaining: 100.0 - used,
    total: 100.0,
    unit: '%',
    reset_at: resetAt,
    reset_in_sec: resetInSec,
    status_text: statusText || '',
    models: models.length ? models : null,
  };
}

export function parseOllamaQuotaHtml(
  html: string,
  now: Date,
): [string, OllamaQuotaWindow[]] {
  if (/(sign in|log in|invalid credentials)/i.test(html) && !html.includes('Cloud usage')) {
    throw new Error('未登录或 cookie 无效');
  }

  const block = extractCloudUsageBlock(html);
  const plan = parsePlan(block);
  const tracks = parseUsageTracks(block);
  const statusTexts = parsePeriodHeaders(block);
  const resets = parseResetInfo(block);

  const windows: OllamaQuotaWindow[] = [];
  const labels = [LABEL_SESSION, LABEL_WEEKLY];
  for (let index = 0; index < labels.length; index++) {
    const track = tracks[index] || { used_percent: null, models: [] as OllamaModelUsage[] };
    const [resetAt] = resets[index] || [null, null];
    const window = buildWindow(
      labels[index],
      track.used_percent,
      statusTexts[index],
      resetAt,
      track.models || [],
      now,
    );
    if (window) windows.push(window);
  }

  if (!windows.length) throw new Error('无法从 settings 页面解析 Cloud usage 数据');
  return [plan, windows];
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

export async function fetchOllamaQuotaForAccount(
  account: OllamaAccountConfig,
  index: number,
): Promise<OllamaQuotaAccount> {
  const now = new Date();
  const updatedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (!account.session_cookie.trim()) {
    return {
      index,
      name: account.name,
      success: false,
      updated_at: updatedAt,
      error: '未配置 session_cookie',
    };
  }

  const cookieHeader = buildOllamaCookieHeader(account.session_cookie);
  if (!cookieHeader) {
    return {
      index,
      name: account.name,
      success: false,
      updated_at: updatedAt,
      error: 'session_cookie 无效',
    };
  }

  try {
    const resp = await fetchWithTimeout(SETTINGS_URL, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`认证失败 (HTTP ${resp.status})，请检查 session cookie`);
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`settings 页面返回 HTTP ${resp.status}`);
    }

    const html = (await resp.text()).slice(0, MAX_HTML_BYTES);
    const [plan, windows] = parseOllamaQuotaHtml(html, now);
    const filtered = windows.filter((window) => {
      if (window.label === LABEL_SESSION && account.show_session === false) return false;
      if (window.label === LABEL_WEEKLY && account.show_weekly === false) return false;
      return true;
    });

    return {
      index,
      name: account.name,
      success: true,
      updated_at: updatedAt,
      plan,
      windows: filtered,
    };
  } catch (exc) {
    return {
      index,
      name: account.name,
      success: false,
      updated_at: updatedAt,
      error: String(exc instanceof Error ? exc.message : exc),
    };
  }
}

export async function fetchAllOllamaQuotas(
  accounts: OllamaAccountConfig[],
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for (let index = 0; index < accounts.length; index++) {
    const quota = await fetchOllamaQuotaForAccount(accounts[index], index);
    results.push(accountToDict(quota));
  }
  return results;
}
