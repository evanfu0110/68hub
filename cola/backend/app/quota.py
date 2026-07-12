from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx

from .config import AccountConfig

DASHBOARD_BASE = "https://opencode.ai/workspace"
WORKSPACE_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f"
DEFAULT_WORKSPACE_ID = "Default"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0"
TIMEOUT = 10.0
MAX_HTML_BYTES = 4 << 20

LABEL_ROLLING = "5h Rolling"
LABEL_WEEKLY = "Weekly"
LABEL_MONTHLY = "Monthly"

RE_ROLLING_PCT_FIRST = re.compile(
    r"rollingUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}"
)
RE_ROLLING_RESET_FIRST = re.compile(
    r"rollingUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}"
)
RE_WEEKLY_PCT_FIRST = re.compile(
    r"weeklyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}"
)
RE_WEEKLY_RESET_FIRST = re.compile(
    r"weeklyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}"
)
RE_MONTHLY_PCT_FIRST = re.compile(
    r"monthlyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}"
)
RE_MONTHLY_RESET_FIRST = re.compile(
    r"monthlyUsage:\s*\$R\[\d+\]\s*=\s*\{[^}]*resetInSec\s*:\s*(-?\d+(?:\.\d+)?)[^}]*usagePercent\s*:\s*(-?\d+(?:\.\d+)?)[^}]*\}"
)
RE_WORKSPACE_ID = re.compile(r"wrk_[A-Za-z0-9]+")
RE_WORKSPACE_ENTRY = re.compile(r'id\s*:\s*"(wrk_[^"]+)"[^{}]*?name\s*:\s*"([^"]*)"', re.DOTALL)


@dataclass
class QuotaWindow:
    label: str
    used: float
    remaining: float
    total: float
    unit: str
    reset_at: str
    reset_in_sec: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "used": self.used,
            "remaining": self.remaining,
            "total": self.total,
            "unit": self.unit,
            "reset_at": self.reset_at,
            "reset_in_sec": self.reset_in_sec,
        }


@dataclass
class QuotaAccount:
    index: int
    name: str
    workspace_id: str
    success: bool
    updated_at: str
    windows: list[QuotaWindow]
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "index": self.index,
            "name": self.name,
            "workspace_id": self.workspace_id,
            "success": self.success,
            "updated_at": self.updated_at,
        }
        if self.error:
            payload["error"] = self.error
        if self.windows:
            payload["windows"] = [w.to_dict() for w in self.windows]
        return payload


def build_cookie_header(auth_cookie: str) -> str:
    cookie = auth_cookie.strip()
    if cookie.lower().startswith("cookie:"):
        cookie = cookie[7:].strip()
    if not cookie:
        return ""
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("auth="):
            return part
    return f"auth={cookie}"


def extract_workspace_id(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    if value.startswith("wrk_") and len(value) > 4:
        return value
    match = RE_WORKSPACE_ID.search(value)
    return match.group(0) if match else ""


async def fetch_workspace_refs(client: httpx.AsyncClient, auth_cookie: str) -> list[tuple[str, str]]:
    cookie_header = build_cookie_header(auth_cookie)
    if not cookie_header:
        raise ValueError("OpenCode Go auth cookie 为空")

    url = f"https://opencode.ai/_server?id={quote(WORKSPACE_SERVER_ID)}"
    headers = {
        "Cookie": cookie_header,
        "X-Server-Id": WORKSPACE_SERVER_ID,
        "X-Server-Instance": f"server-fn:{int(datetime.now(UTC).timestamp() * 1e9)}",
        "User-Agent": USER_AGENT,
        "Origin": "https://opencode.ai",
        "Referer": "https://opencode.ai",
        "Accept": "text/javascript, application/json;q=0.9, */*;q=0.8",
    }
    resp = await client.get(url, headers=headers)
    if resp.status_code in (401, 403):
        raise ValueError(f"认证失败 (HTTP {resp.status_code})，请检查 auth cookie")
    if resp.status_code < 200 or resp.status_code >= 300:
        raise ValueError(f"工作区查询返回 HTTP {resp.status_code}")

    text = resp.text[:MAX_HTML_BYTES]
    matches = RE_WORKSPACE_ENTRY.findall(text)
    if not matches:
        raise ValueError("无法从账号数据解析工作区 ID")

    seen: set[str] = set()
    refs: list[tuple[str, str]] = []
    for workspace_id, name in matches:
        if workspace_id in seen:
            continue
        seen.add(workspace_id)
        refs.append((workspace_id, name.strip()))
    return refs


async def resolve_workspace_id(
    client: httpx.AsyncClient, workspace_hint: str, auth_cookie: str
) -> str:
    resolved = extract_workspace_id(workspace_hint)
    if resolved:
        return resolved

    refs = await fetch_workspace_refs(client, auth_cookie)
    hint = workspace_hint.strip()
    if hint:
        for workspace_id, name in refs:
            if workspace_id.lower() == hint.lower() or name.lower() == hint.lower():
                return workspace_id
    if refs:
        return refs[0][0]
    if hint:
        raise ValueError(f'无法从 "{hint}" 解析工作区 ID')
    raise ValueError("无法解析 OpenCode Go 工作区 ID")


def _parse_window(pct_first: re.Pattern[str], reset_first: re.Pattern[str], html: str) -> tuple[float, int] | None:
    match = pct_first.search(html)
    if match:
        return float(match.group(1)), int(float(match.group(2)))
    match = reset_first.search(html)
    if match:
        return float(match.group(2)), int(float(match.group(1)))
    return None


def _clamp_percent(value: float) -> float:
    return max(0.0, min(100.0, value))


def _normalize_window(label: str, usage_percent: float, reset_in_sec: int, now: datetime) -> QuotaWindow:
    used = _clamp_percent(usage_percent)
    reset_at = now + timedelta(seconds=reset_in_sec)
    return QuotaWindow(
        label=label,
        used=used,
        remaining=100.0 - used,
        total=100.0,
        unit="%",
        reset_at=reset_at.isoformat().replace("+00:00", "Z"),
        reset_in_sec=reset_in_sec,
    )


def parse_quota_html(html: str, now: datetime) -> list[QuotaWindow]:
    windows: list[QuotaWindow] = []
    pairs = (
        (LABEL_ROLLING, RE_ROLLING_PCT_FIRST, RE_ROLLING_RESET_FIRST),
        (LABEL_WEEKLY, RE_WEEKLY_PCT_FIRST, RE_WEEKLY_RESET_FIRST),
        (LABEL_MONTHLY, RE_MONTHLY_PCT_FIRST, RE_MONTHLY_RESET_FIRST),
    )
    for label, pct_re, reset_re in pairs:
        parsed = _parse_window(pct_re, reset_re, html)
        if parsed:
            windows.append(_normalize_window(label, parsed[0], parsed[1], now))
    return windows


def filter_windows(windows: list[QuotaWindow], account: AccountConfig) -> list[QuotaWindow]:
    out: list[QuotaWindow] = []
    for window in windows:
        if window.label == LABEL_ROLLING and not account.show_rolling:
            continue
        if window.label == LABEL_WEEKLY and not account.show_weekly:
            continue
        if window.label == LABEL_MONTHLY and not account.show_monthly:
            continue
        out.append(window)
    return out


async def fetch_quota_for_account(account: AccountConfig, index: int) -> QuotaAccount:
    now = datetime.now(UTC)
    updated_at = now.isoformat().replace("+00:00", "Z")
    workspace_hint = (account.workspace_id or DEFAULT_WORKSPACE_ID).strip() or DEFAULT_WORKSPACE_ID

    if not account.auth_cookie.strip():
        return QuotaAccount(
            index=index,
            name=account.name,
            workspace_id=workspace_hint,
            success=False,
            updated_at=updated_at,
            windows=[],
            error="未配置 auth_cookie",
        )

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
            resolved_id = await resolve_workspace_id(client, workspace_hint, account.auth_cookie)
            cookie_header = build_cookie_header(account.auth_cookie)
            if not cookie_header:
                raise ValueError("OpenCode Go auth cookie 为空")

            dashboard_url = f"{DASHBOARD_BASE.rstrip('/')}/{quote(resolved_id, safe='')}/go"
            resp = await client.get(
                dashboard_url,
                headers={
                    "Cookie": cookie_header,
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html, application/xhtml+xml",
                },
            )

            if 300 <= resp.status_code < 400:
                location = resp.headers.get("Location", "")
                if location:
                    raise ValueError(
                        f"Dashboard 重定向 (HTTP {resp.status_code} → {location})，请检查 workspace_id 与 cookie"
                    )
                raise ValueError(f"Dashboard 重定向 (HTTP {resp.status_code})，请检查 workspace_id 与 cookie")
            if resp.status_code in (401, 403):
                raise ValueError(f"认证失败 (HTTP {resp.status_code})，请检查 auth cookie")
            if resp.status_code == 404:
                raise ValueError(f"工作区不存在 (HTTP 404)，请确认 workspace_id")
            if resp.status_code < 200 or resp.status_code >= 300:
                raise ValueError(f"Dashboard 返回 HTTP {resp.status_code}")

            windows = parse_quota_html(resp.text[:MAX_HTML_BYTES], now)
            if not windows:
                raise ValueError("无法从 Dashboard HTML 解析额度数据")

            return QuotaAccount(
                index=index,
                name=account.name,
                workspace_id=resolved_id,
                success=True,
                updated_at=updated_at,
                windows=filter_windows(windows, account),
            )
    except Exception as exc:
        return QuotaAccount(
            index=index,
            name=account.name,
            workspace_id=workspace_hint,
            success=False,
            updated_at=updated_at,
            windows=[],
            error=str(exc),
        )


_quota_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_QUOTA_CACHE_TTL = 15.0


async def fetch_all_quotas(accounts: list[AccountConfig]) -> list[dict[str, Any]]:
    now = datetime.now(UTC).timestamp()
    cache_key = "|".join(f"{a.name}:{a.workspace_id}" for a in accounts)
    cached = _quota_cache.get(cache_key)
    if cached and (now - cached[0]) < _QUOTA_CACHE_TTL:
        return cached[1]

    tasks = [fetch_quota_for_account(account, i) for i, account in enumerate(accounts)]
    results = await asyncio.gather(*tasks)
    dicts = [r.to_dict() for r in results]
    _quota_cache[cache_key] = (now, dicts)
    return dicts
