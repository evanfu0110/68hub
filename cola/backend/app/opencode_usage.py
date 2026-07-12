from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from .config import DEFAULT_USAGE_SERVER_ID, load_service_config
from .quota import USER_AGENT, build_cookie_header, resolve_workspace_id

USAGE_PAGE_SIZE = 50
TIMEOUT = 15.0
MAX_RESPONSE_BYTES = 4 << 20

RECORD_RE = re.compile(
    r'id:"(usg_[^"]+)"[^}]*?'
    r'timeCreated:\$R\[\d+\]=new Date\("([^"]+)"\)[^}]*?'
    r'model:"([^"]+)"[^}]*?provider:"([^"]+)"[^}]*?'
    r'inputTokens:(\d+)[^}]*?outputTokens:(\d+)[^}]*?'
    r'cost:([0-9]+)[^}]*?keyID:"([^"]+)"',
    re.DOTALL,
)
PLAN_RE = re.compile(
    r'id:"(usg_[^"]+)"[^}]*?enrichment:\$R\[\d+\]=\{plan:"([^"]+)"\}',
    re.DOTALL,
)


@dataclass
class ParsedUsageRecord:
    usg_id: str
    created_at: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int
    cost_raw: int
    cost_usd: float
    key_id: str
    plan: str | None = None

    def to_db_dict(self) -> dict[str, Any]:
        return {
            "usg_id": self.usg_id,
            "created_at": self.created_at,
            "model": self.model,
            "provider": self.provider,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_raw": self.cost_raw,
            "cost_usd": self.cost_usd,
            "key_id": self.key_id,
            "plan": self.plan,
        }


def parse_usage_response(text: str) -> list[ParsedUsageRecord]:
    plans = {usg_id: plan for usg_id, plan in PLAN_RE.findall(text)}
    records: list[ParsedUsageRecord] = []
    for match in RECORD_RE.findall(text):
        usg_id, created_at, model, provider, inp, out, cost_raw, key_id = match
        cost_int = int(cost_raw)
        records.append(
            ParsedUsageRecord(
                usg_id=usg_id,
                created_at=created_at,
                model=model,
                provider=provider,
                input_tokens=int(inp),
                output_tokens=int(out),
                cost_raw=cost_int,
                cost_usd=cost_int / 1_000_000_000,
                key_id=key_id,
                plan=plans.get(usg_id),
            )
        )
    return records


def _usage_server_id() -> str:
    return load_service_config().opencode.usage_server_id or DEFAULT_USAGE_SERVER_ID


async def fetch_usage_page(
    *,
    workspace_id: str,
    auth_cookie: str,
    page: int = 0,
    key_id: str | None = None,
) -> list[ParsedUsageRecord]:
    cookie_header = build_cookie_header(auth_cookie)
    if not cookie_header:
        raise ValueError("OpenCode Go auth cookie 为空")

    args: list[Any] = [workspace_id]
    if key_id:
        if page > 0:
            args.extend([page, key_id])
        else:
            args.append(key_id)
    elif page > 0:
        args.append(page)

    server_id = _usage_server_id()
    url = f"https://opencode.ai/_server?id={quote(server_id)}&args={quote(json.dumps(args))}"
    referer = f"https://opencode.ai/workspace/{workspace_id}/usage"
    headers = {
        "Cookie": cookie_header,
        "X-Server-Id": server_id,
        "X-Server-Instance": f"server-fn:{uuid.uuid4()}",
        "User-Agent": USER_AGENT,
        "Origin": "https://opencode.ai",
        "Referer": referer,
        "Accept": "text/javascript, application/json;q=0.9, */*;q=0.8",
    }

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code in (401, 403):
            raise ValueError(f"认证失败 (HTTP {resp.status_code})，请检查 auth cookie")
        if resp.status_code < 200 or resp.status_code >= 300:
            raise ValueError(f"使用记录查询返回 HTTP {resp.status_code}")
        return parse_usage_response(resp.text[:MAX_RESPONSE_BYTES])


async def resolve_account_workspace_id(
    workspace_hint: str, auth_cookie: str, resolved: str | None = None
) -> str:
    if resolved and resolved.startswith("wrk_"):
        return resolved
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
        return await resolve_workspace_id(client, workspace_hint, auth_cookie)
