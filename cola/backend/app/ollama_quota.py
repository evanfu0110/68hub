from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from .config import OllamaAccountConfig

SETTINGS_URL = "https://ollama.com/settings"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
TIMEOUT = 20.0
MAX_HTML_BYTES = 4 << 20

LABEL_SESSION = "Session"
LABEL_WEEKLY = "Weekly"


@dataclass
class OllamaModelUsage:
    model: str
    requests: int
    share_percent: float | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"model": self.model, "requests": self.requests}
        if self.share_percent is not None:
            payload["share_percent"] = self.share_percent
        return payload


@dataclass
class OllamaQuotaWindow:
    label: str
    used: float
    remaining: float
    total: float
    unit: str
    reset_at: str
    reset_in_sec: int
    status_text: str = ""
    models: list[OllamaModelUsage] | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "label": self.label,
            "used": self.used,
            "remaining": self.remaining,
            "total": self.total,
            "unit": self.unit,
            "reset_at": self.reset_at,
            "reset_in_sec": self.reset_in_sec,
        }
        if self.status_text:
            payload["status_text"] = self.status_text
        if self.models:
            payload["models"] = [m.to_dict() for m in self.models]
        return payload


@dataclass
class OllamaQuotaAccount:
    index: int
    name: str
    success: bool
    updated_at: str
    plan: str = ""
    windows: list[OllamaQuotaWindow] | None = None
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "index": self.index,
            "name": self.name,
            "success": self.success,
            "updated_at": self.updated_at,
        }
        if self.plan:
            payload["plan"] = self.plan
        if self.error:
            payload["error"] = self.error
        if self.windows:
            payload["windows"] = [w.to_dict() for w in self.windows]
        return payload


def build_ollama_cookie_header(session_cookie: str) -> str:
    cookie = session_cookie.strip()
    if cookie.lower().startswith("cookie:"):
        cookie = cookie[7:].strip()
    if not cookie:
        return ""
    if "=" not in cookie:
        return f"__Secure-session={cookie}"
    return cookie.rstrip(";")


def _extract_cloud_usage_block(html: str) -> str:
    match = re.search(
        r"<span>Cloud usage</span>(.*?)</div>\s*<script>",
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        raise ValueError("页面中未找到 Cloud usage 区块（可能未登录或页面结构已变更）")
    return match.group(1)


def _parse_plan(block: str) -> str:
    match = re.search(
        r'rounded-full[^>]*capitalize[^>]*>\s*([^<]+?)\s*</span',
        block,
        re.IGNORECASE,
    )
    return match.group(1).strip() if match else ""


def _parse_percent_from_aria(aria_label: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%\s*used", aria_label, re.IGNORECASE)
    return float(match.group(1)) if match else None


def _parse_usage_tracks(block: str) -> list[dict[str, Any]]:
    tracks: list[dict[str, Any]] = []
    for track_match in re.finditer(
        r'data-usage-track[^>]*aria-label="([^"]+)"[^>]*>(.*?)</div>',
        block,
        re.DOTALL | re.IGNORECASE,
    ):
        aria_label = track_match.group(1)
        inner = track_match.group(2)
        models: list[OllamaModelUsage] = []
        for seg in re.finditer(
            r"<button\b[^>]*data-usage-segment[^>]*>",
            inner,
            re.IGNORECASE,
        ):
            tag = seg.group(0)
            model_match = re.search(r'data-model="([^"]+)"', tag)
            requests_match = re.search(r'data-requests="(\d+)"', tag)
            width_match = re.search(r"width:\s*([\d.]+)%", tag)
            if not model_match or not requests_match:
                continue
            models.append(
                OllamaModelUsage(
                    model=model_match.group(1),
                    requests=int(requests_match.group(1)),
                    share_percent=float(width_match.group(1)) if width_match else None,
                )
            )
        tracks.append(
            {
                "aria_label": aria_label,
                "used_percent": _parse_percent_from_aria(aria_label),
                "models": models,
            }
        )
    return tracks


def _parse_period_headers(block: str) -> list[str | None]:
    headers: list[str | None] = []
    for section in re.finditer(
        r'<div class="flex justify-between mb-2">(.*?)</div>',
        block,
        re.DOTALL,
    ):
        spans = re.findall(
            r'<span class="text-sm[^"]*"[^>]*>\s*([^<]+?)\s*</span',
            section.group(1),
            re.DOTALL,
        )
        if len(spans) >= 2:
            headers.append(spans[1].strip())
        if len(headers) >= 2:
            break
    while len(headers) < 2:
        headers.append(None)
    return headers[:2]


def _parse_reset_info(block: str) -> list[tuple[str | None, str | None]]:
    resets: list[tuple[str | None, str | None]] = []
    for item in re.finditer(
        r'class="[^"]*local-time[^"]*"[^>]*data-time="([^"]+)"[^>]*>\s*([^<]+?)\s*</div>',
        block,
        re.IGNORECASE,
    ):
        resets.append((item.group(1), item.group(2).strip()))
    while len(resets) < 2:
        resets.append((None, None))
    return resets[:2]


def _parse_reset_at(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _clamp_percent(value: float) -> float:
    return max(0.0, min(100.0, value))


def _build_window(
    label: str,
    used_percent: float | None,
    status_text: str | None,
    reset_at_raw: str | None,
    models: list[OllamaModelUsage],
    now: datetime,
) -> OllamaQuotaWindow | None:
    if used_percent is None:
        return None
    used = _clamp_percent(used_percent)
    reset_at_dt = _parse_reset_at(reset_at_raw)
    if reset_at_dt:
        reset_in_sec = max(0, int((reset_at_dt - now).total_seconds()))
        reset_at = reset_at_dt.isoformat().replace("+00:00", "Z")
    else:
        reset_in_sec = 0
        reset_at = ""
    return OllamaQuotaWindow(
        label=label,
        used=used,
        remaining=100.0 - used,
        total=100.0,
        unit="%",
        reset_at=reset_at,
        reset_in_sec=reset_in_sec,
        status_text=status_text or "",
        models=models or None,
    )


def parse_ollama_quota_html(html: str, now: datetime) -> tuple[str, list[OllamaQuotaWindow]]:
    if re.search(r"(sign in|log in|invalid credentials)", html, re.IGNORECASE):
        if "Cloud usage" not in html:
            raise ValueError("未登录或 cookie 无效")

    block = _extract_cloud_usage_block(html)
    plan = _parse_plan(block)
    tracks = _parse_usage_tracks(block)
    status_texts = _parse_period_headers(block)
    resets = _parse_reset_info(block)

    windows: list[OllamaQuotaWindow] = []
    for index, (label_key, label) in enumerate([(LABEL_SESSION, LABEL_SESSION), (LABEL_WEEKLY, LABEL_WEEKLY)]):
        track = tracks[index] if index < len(tracks) else {}
        reset_at, _ = resets[index] if index < len(resets) else (None, None)
        window = _build_window(
            label=label,
            used_percent=track.get("used_percent"),
            status_text=status_texts[index] if index < len(status_texts) else None,
            reset_at_raw=reset_at,
            models=track.get("models", []),
            now=now,
        )
        if window:
            windows.append(window)

    if not windows:
        raise ValueError("无法从 settings 页面解析 Cloud usage 数据")
    return plan, windows


async def fetch_ollama_quota_for_account(account: OllamaAccountConfig, index: int) -> OllamaQuotaAccount:
    now = datetime.now(UTC)
    updated_at = now.isoformat().replace("+00:00", "Z")

    if not account.session_cookie.strip():
        return OllamaQuotaAccount(
            index=index,
            name=account.name,
            success=False,
            updated_at=updated_at,
            error="未配置 session_cookie",
        )

    cookie_header = build_ollama_cookie_header(account.session_cookie)
    if not cookie_header:
        return OllamaQuotaAccount(
            index=index,
            name=account.name,
            success=False,
            updated_at=updated_at,
            error="session_cookie 无效",
        )

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(
                SETTINGS_URL,
                headers={
                    "Cookie": cookie_header,
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
            if resp.status_code in (401, 403):
                raise ValueError(f"认证失败 (HTTP {resp.status_code})，请检查 session cookie")
            if resp.status_code < 200 or resp.status_code >= 300:
                raise ValueError(f"settings 页面返回 HTTP {resp.status_code}")

            plan, windows = parse_ollama_quota_html(resp.text[:MAX_HTML_BYTES], now)
            filtered: list[OllamaQuotaWindow] = []
            for window in windows:
                if window.label == LABEL_SESSION and not account.show_session:
                    continue
                if window.label == LABEL_WEEKLY and not account.show_weekly:
                    continue
                filtered.append(window)

            return OllamaQuotaAccount(
                index=index,
                name=account.name,
                success=True,
                updated_at=updated_at,
                plan=plan,
                windows=filtered,
            )
    except Exception as exc:
        return OllamaQuotaAccount(
            index=index,
            name=account.name,
            success=False,
            updated_at=updated_at,
            error=str(exc),
        )


async def fetch_all_ollama_quotas(accounts: list[OllamaAccountConfig]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, account in enumerate(accounts):
        quota = await fetch_ollama_quota_for_account(account, index)
        results.append(quota.to_dict())
    return results
