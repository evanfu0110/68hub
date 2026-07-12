from __future__ import annotations

from typing import Any

from . import db
from .config import AccountConfig, OllamaAccountConfig
from .ollama_quota import fetch_all_ollama_quotas
from .quota import LABEL_MONTHLY, LABEL_ROLLING, LABEL_WEEKLY, fetch_all_quotas

LABEL_SESSION = "Session"


def plan_multiplier(plan: str) -> int:
    return 5 if "max" in plan.lower() else 1


def _window_by_label(windows: list[dict[str, Any]], label: str) -> dict[str, Any] | None:
    for window in windows:
        if window.get("label") == label:
            return window
    return None


def apply_opencode_cascade(windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    monthly = _window_by_label(windows, LABEL_MONTHLY)
    weekly = _window_by_label(windows, LABEL_WEEKLY)
    rolling = _window_by_label(windows, LABEL_ROLLING)

    monthly_full = monthly is not None and float(monthly.get("used", 0)) >= 100
    weekly_full = weekly is not None and float(weekly.get("used", 0)) >= 100

    result: list[dict[str, Any]] = []
    for window in windows:
        item = dict(window)
        label = item.get("label", "")
        blocked = False
        blocked_by = ""
        if label == LABEL_WEEKLY and monthly_full:
            blocked = True
            blocked_by = LABEL_MONTHLY
        elif label == LABEL_ROLLING and (monthly_full or weekly_full):
            blocked = True
            blocked_by = LABEL_MONTHLY if monthly_full else LABEL_WEEKLY
        if blocked:
            item["blocked"] = True
            item["blocked_by"] = blocked_by
            item["effective_remaining"] = 0.0
        else:
            item["blocked"] = False
            item["effective_remaining"] = float(item.get("remaining", 0))
        result.append(item)
    return result


def opencode_effective_remaining(windows: list[dict[str, Any]]) -> float:
    cascaded = apply_opencode_cascade(windows)
    rolling = _window_by_label(cascaded, LABEL_ROLLING)
    if rolling is not None:
        return float(rolling.get("effective_remaining", 0))
    weekly = _window_by_label(cascaded, LABEL_WEEKLY)
    if weekly is not None:
        return float(weekly.get("effective_remaining", 0))
    monthly = _window_by_label(cascaded, LABEL_MONTHLY)
    if monthly is not None:
        return float(monthly.get("effective_remaining", 0))
    return 0.0


def ollama_account_pro_stats(account: dict[str, Any]) -> dict[str, Any]:
    plan = str(account.get("plan") or "")
    multiplier = plan_multiplier(plan)
    session = None
    for window in account.get("windows") or []:
        if window.get("label") == LABEL_SESSION:
            session = window
            break
    remaining_pct = float(session.get("remaining", 0)) if session else 0.0
    remaining_pro = (remaining_pct / 100.0) * multiplier
    return {
        "account_id": account.get("account_id"),
        "name": account.get("name"),
        "plan": plan,
        "multiplier": multiplier,
        "remaining_pro": round(remaining_pro, 2),
        "capacity_pro": multiplier,
        "success": account.get("success", False),
    }


def aggregate_ollama(accounts: list[dict[str, Any]]) -> dict[str, Any]:
    per_account = [ollama_account_pro_stats(a) for a in accounts]
    successful = [a for a in per_account if a["success"]]
    total_remaining = round(sum(a["remaining_pro"] for a in successful), 2)
    total_capacity = round(sum(a["capacity_pro"] for a in successful), 2)
    return {
        "total_remaining_pro": total_remaining,
        "total_capacity_pro": total_capacity,
        "account_count": len(accounts),
        "success_count": len(successful),
        "accounts": per_account,
    }


def aggregate_opencode(accounts: list[dict[str, Any]]) -> dict[str, Any]:
    per_account: list[dict[str, Any]] = []
    effective_values: list[float] = []
    blocked_count = 0

    for account in accounts:
        windows = account.get("windows") or []
        cascaded = apply_opencode_cascade(windows)
        effective = opencode_effective_remaining(windows)
        is_blocked = effective <= 0 and account.get("success")
        if is_blocked:
            blocked_count += 1
        if account.get("success"):
            effective_values.append(effective)
        per_account.append(
            {
                "account_id": account.get("account_id"),
                "name": account.get("name"),
                "success": account.get("success", False),
                "effective_remaining": round(effective, 1),
                "blocked": is_blocked,
                "windows": cascaded,
            }
        )

    avg_effective = round(sum(effective_values) / len(effective_values), 1) if effective_values else 0.0
    return {
        "avg_effective_remaining": avg_effective,
        "account_count": len(accounts),
        "success_count": len(effective_values),
        "blocked_count": blocked_count,
        "accounts": per_account,
    }


def aggregate_ollama_models(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, int] = {}
    for account in accounts:
        if not account.get("success"):
            continue
        for window in account.get("windows") or []:
            if window.get("label") not in (LABEL_SESSION, "Weekly"):
                continue
            for model in window.get("models") or []:
                name = str(model.get("model") or "")
                if not name:
                    continue
                totals[name] = totals.get(name, 0) + int(model.get("requests") or 0)
    return [
        {"model": model, "requests": count}
        for model, count in sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    ]


async def build_overview() -> dict[str, Any]:
    opencode_rows = db.list_opencode_accounts(enabled_only=True)
    ollama_rows = db.list_ollama_accounts(enabled_only=True)

    opencode_accounts_cfg = [
        AccountConfig(
            name=row.name,
            workspace_id=row.workspace_id,
            auth_cookie=row.auth_cookie,
            show_rolling=row.show_rolling,
            show_weekly=row.show_weekly,
            show_monthly=row.show_monthly,
        )
        for row in opencode_rows
    ]
    ollama_accounts_cfg = [
        OllamaAccountConfig(
            name=row.name,
            session_cookie=row.session_cookie,
            show_session=row.show_session,
            show_weekly=row.show_weekly,
        )
        for row in ollama_rows
    ]

    opencode_quotas = await fetch_all_quotas(opencode_accounts_cfg) if opencode_accounts_cfg else []
    ollama_quotas = await fetch_all_ollama_quotas(ollama_accounts_cfg) if ollama_accounts_cfg else []

    opencode_id_by_name = {row.name: row.id for row in opencode_rows}
    ollama_id_by_name = {row.name: row.id for row in ollama_rows}
    for item in opencode_quotas:
        item["account_id"] = opencode_id_by_name.get(item.get("name", ""))
    for item in ollama_quotas:
        item["account_id"] = ollama_id_by_name.get(item.get("name", ""))

    ollama_summary = aggregate_ollama(ollama_quotas)
    opencode_summary = aggregate_opencode(opencode_quotas)
    model_stats = aggregate_ollama_models(ollama_quotas)

    return {
        "ollama": ollama_summary,
        "opencode": opencode_summary,
        "ollama_models": model_stats,
    }
