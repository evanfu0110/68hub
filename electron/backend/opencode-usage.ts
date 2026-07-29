import { randomUUID } from 'crypto';
import { DEFAULT_USAGE_SERVER_ID, loadServiceConfig } from './config';
import { outboundFetch } from './http-client';
import { USER_AGENT, buildCookieHeader, resolveWorkspaceId } from './quota';

export const USAGE_PAGE_SIZE = 50;
const TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 4 << 20;

const JS_STRING_SOURCE = '"(?:\\\\.|[^"\\\\])*"';
const USAGE_ID_RE = new RegExp(
  `(?:^|[,{])\\s*"?id"?\\s*:\\s*(${JS_STRING_SOURCE})`,
  'gs',
);

export interface ParsedUsageRecord {
  usg_id: string;
  created_at: string;
  model: string;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_raw: number;
  cost_usd: number;
  key_id: string | null;
  plan: string | null;
}

export function toDbDict(r: ParsedUsageRecord): Record<string, unknown> {
  return {
    usg_id: r.usg_id,
    created_at: r.created_at,
    model: r.model,
    provider: r.provider,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_raw: r.cost_raw,
    cost_usd: r.cost_usd,
    key_id: r.key_id,
    plan: r.plan,
  };
}

export function parseUsageResponse(text: string): ParsedUsageRecord[] {
  interface PartialRecord {
    usg_id: string;
    created_at?: string;
    model?: string;
    provider?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    cost_raw?: number;
    key_id?: string | null;
    plan?: string | null;
  }

  function decodeString(literal: string | undefined): string | undefined {
    if (!literal) return undefined;
    try {
      const decoded = JSON.parse(literal);
      return typeof decoded === 'string' ? decoded : undefined;
    } catch {
      return undefined;
    }
  }

  function propertyPattern(field: string, valueSource: string): RegExp {
    return new RegExp(`"?${field}"?\\s*:\\s*(${valueSource})`, 's');
  }

  function extractString(fragment: string, ...fields: string[]): string | undefined {
    for (const field of fields) {
      const match = propertyPattern(field, JS_STRING_SOURCE).exec(fragment);
      const value = decodeString(match?.[1]);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  function extractNumber(fragment: string, ...fields: string[]): number | undefined {
    for (const field of fields) {
      const match = propertyPattern(field, '-?\\d+(?:\\.\\d+)?').exec(fragment);
      if (!match) continue;
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  function extractCreatedAt(fragment: string): string | undefined {
    const assignedDate = new RegExp(
      `"?timeCreated"?\\s*:\\s*(?:\\$R\\[\\d+\\]\\s*=\\s*)?new Date\\(\\s*(${JS_STRING_SOURCE})\\s*\\)`,
      's',
    ).exec(fragment);
    const assignedValue = decodeString(assignedDate?.[1]);
    if (assignedValue !== undefined) return assignedValue;

    const directValue = extractString(fragment, 'timeCreated', 'createdAt');
    if (directValue !== undefined) return directValue;

    const reference = /"?timeCreated"?\s*:\s*\$R\[(\d+)\]/s.exec(fragment)?.[1];
    if (!reference) return undefined;
    const referencedValue = new RegExp(
      `\\$R\\[${reference}\\]\\s*=\\s*(?:new Date\\(\\s*)?(${JS_STRING_SOURCE})\\s*\\)?`,
      's',
    ).exec(text);
    return decodeString(referencedValue?.[1]);
  }

  function enclosingObject(source: string, position: number): string | undefined {
    const stack: number[] = [];
    let inString = false;
    let escaped = false;
    for (let index = 0; index <= position && index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') stack.push(index);
      else if (char === '}') stack.pop();
    }
    const start = stack[stack.length - 1];
    if (start === undefined) return undefined;

    let depth = 0;
    inString = false;
    escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    return undefined;
  }

  const occurrences: Array<{ id: string; start: number }> = [];
  USAGE_ID_RE.lastIndex = 0;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = USAGE_ID_RE.exec(text)) !== null) {
    const id = decodeString(idMatch[1]);
    if (id?.startsWith('usg_')) occurrences.push({ id, start: idMatch.index });
  }

  const partials = new Map<string, PartialRecord>();
  for (let index = 0; index < occurrences.length; index += 1) {
    const occurrence = occurrences[index];
    const end = occurrences[index + 1]?.start ?? text.length;
    const fragment = enclosingObject(text, occurrence.start) ?? text.slice(occurrence.start, end);
    const existing: PartialRecord = partials.get(occurrence.id) ?? {
      usg_id: occurrence.id,
    };
    const createdAt = extractCreatedAt(fragment);
    const model = extractString(fragment, 'model');
    const provider = extractString(fragment, 'provider');
    const inputTokens = extractNumber(fragment, 'inputTokens');
    const outputTokens = extractNumber(fragment, 'outputTokens');
    const costRaw = extractNumber(fragment, 'cost');
    const keyId = extractString(fragment, 'keyID', 'keyId');
    const plan = extractString(fragment, 'plan');

    if (createdAt !== undefined) existing.created_at = createdAt;
    if (model !== undefined) existing.model = model;
    if (provider !== undefined) existing.provider = provider;
    if (inputTokens !== undefined) existing.input_tokens = inputTokens;
    if (outputTokens !== undefined) existing.output_tokens = outputTokens;
    if (costRaw !== undefined) existing.cost_raw = costRaw;
    if (keyId !== undefined) existing.key_id = keyId;
    if (plan !== undefined) existing.plan = plan;
    partials.set(occurrence.id, existing);
  }

  const records: ParsedUsageRecord[] = [];
  for (const partial of partials.values()) {
    if (
      partial.created_at === undefined ||
      partial.model === undefined ||
      partial.input_tokens === undefined ||
      partial.output_tokens === undefined ||
      partial.cost_raw === undefined
    ) {
      continue;
    }
    records.push({
      usg_id: partial.usg_id,
      created_at: partial.created_at,
      model: partial.model,
      provider: partial.provider ?? null,
      input_tokens: partial.input_tokens,
      output_tokens: partial.output_tokens,
      cost_raw: partial.cost_raw,
      cost_usd: partial.cost_raw / 1_000_000_000,
      key_id: partial.key_id ?? null,
      plan: partial.plan ?? null,
    });
  }

  if (!records.length && /usg_|"?inputTokens"?\s*:/.test(text)) {
    throw new Error('OpenCode usage response format is incompatible');
  }
  return records;
}

function usageServerId(): string {
  return loadServiceConfig().opencode.usage_server_id || DEFAULT_USAGE_SERVER_ID;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await outboundFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUsagePage(opts: {
  workspace_id: string;
  auth_cookie: string;
  page?: number;
  key_id?: string | null;
}): Promise<ParsedUsageRecord[]> {
  const cookieHeader = buildCookieHeader(opts.auth_cookie);
  if (!cookieHeader) throw new Error('OpenCode Go auth cookie 为空');

  const page = opts.page ?? 0;
  const args: unknown[] = [opts.workspace_id];
  if (opts.key_id) {
    if (page > 0) args.push(page, opts.key_id);
    else args.push(opts.key_id);
  } else if (page > 0) {
    args.push(page);
  }

  const serverId = usageServerId();
  const url = `https://opencode.ai/_server?id=${encodeURIComponent(serverId)}&args=${encodeURIComponent(JSON.stringify(args))}`;
  const referer = `https://opencode.ai/workspace/${opts.workspace_id}/usage`;
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    'X-Server-Id': serverId,
    'X-Server-Instance': `server-fn:${randomUUID()}`,
    'User-Agent': USER_AGENT,
    Origin: 'https://opencode.ai',
    Referer: referer,
    Accept: 'text/javascript, application/json;q=0.9, */*;q=0.8',
  };

  const resp = await fetchWithTimeout(url, { headers, redirect: 'manual' });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`认证失败 (HTTP ${resp.status})，请检查 auth cookie`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`使用记录查询返回 HTTP ${resp.status}`);
  }
  const text = (await resp.text()).slice(0, MAX_RESPONSE_BYTES);
  return parseUsageResponse(text);
}

export async function resolveAccountWorkspaceId(
  workspaceHint: string,
  authCookie: string,
  resolved: string | null = null,
): Promise<string> {
  if (resolved && resolved.startsWith('wrk_')) return resolved;
  return resolveWorkspaceId(workspaceHint, authCookie);
}
