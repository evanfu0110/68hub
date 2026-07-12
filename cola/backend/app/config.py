from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_USAGE_SERVER_ID = (
    "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c"
)

DEFAULT_LISTEN_HOST = "127.0.0.1"
DEFAULT_LISTEN_PORT = 8788

DEFAULT_SETTINGS_PAYLOAD: dict[str, Any] = {
    "refresh": {
        "ollama": {"auto_refresh": True, "interval_sec": 300},
        "opencode_go": {"auto_refresh": True, "interval_sec": 60},
    },
    "usage_sync": {
        "auto_sync": True,
        "interval_sec": 300,
        "backfill_pages_per_request": 30,
        "max_pages_per_incremental": 30,
    },
    "opencode": {
        "usage_server_id": DEFAULT_USAGE_SERVER_ID,
    },
}


@dataclass
class AccountConfig:
    name: str
    workspace_id: str
    auth_cookie: str
    show_rolling: bool = True
    show_weekly: bool = True
    show_monthly: bool = True


@dataclass
class OllamaAccountConfig:
    name: str
    session_cookie: str
    show_session: bool = True
    show_weekly: bool = True


@dataclass
class RefreshSettings:
    auto_refresh: bool = True
    interval_sec: int = 60


@dataclass
class OpenCodeSettings:
    usage_server_id: str = DEFAULT_USAGE_SERVER_ID


@dataclass
class UsageSyncSettings:
    auto_sync: bool = True
    interval_sec: int = 300
    backfill_pages_per_request: int = 5
    max_pages_per_incremental: int = 10


@dataclass
class ServiceConfig:
    listen_host: str
    listen_port: int
    refresh_ollama: RefreshSettings
    refresh_opencode_go: RefreshSettings
    opencode: OpenCodeSettings
    usage_sync: UsageSyncSettings


@dataclass
class AppConfig:
    listen_host: str
    listen_port: int
    opencode_accounts: list[AccountConfig]
    ollama_accounts: list[OllamaAccountConfig]
    refresh_ollama: RefreshSettings
    refresh_opencode_go: RefreshSettings
    opencode: OpenCodeSettings
    usage_sync: UsageSyncSettings


def _parse_refresh_settings(raw: dict[str, Any] | None, *, default_interval: int) -> RefreshSettings:
    if not isinstance(raw, dict):
        return RefreshSettings(interval_sec=default_interval)
    interval = raw.get("interval_sec", default_interval)
    try:
        interval_sec = int(interval)
    except (TypeError, ValueError):
        interval_sec = default_interval
    interval_sec = max(15, interval_sec)
    return RefreshSettings(
        auto_refresh=bool(raw.get("auto_refresh", True)),
        interval_sec=interval_sec,
    )


def _parse_usage_sync_settings(raw: dict[str, Any] | None) -> UsageSyncSettings:
    if not isinstance(raw, dict):
        return UsageSyncSettings()
    interval = raw.get("interval_sec", 300)
    backfill = raw.get("backfill_pages_per_request", 5)
    max_pages = raw.get("max_pages_per_incremental", 10)
    try:
        interval_sec = max(15, int(interval))
    except (TypeError, ValueError):
        interval_sec = 300
    try:
        backfill_pages = max(1, min(int(backfill), 50))
    except (TypeError, ValueError):
        backfill_pages = 5
    try:
        max_pages_per_incremental = max(1, min(int(max_pages), 100))
    except (TypeError, ValueError):
        max_pages_per_incremental = 10
    return UsageSyncSettings(
        auto_sync=bool(raw.get("auto_sync", True)),
        interval_sec=interval_sec,
        backfill_pages_per_request=backfill_pages,
        max_pages_per_incremental=max_pages_per_incremental,
    )


def _parse_opencode_settings(raw: dict[str, Any] | None) -> OpenCodeSettings:
    if not isinstance(raw, dict):
        return OpenCodeSettings()
    server_id = str(raw.get("usage_server_id") or DEFAULT_USAGE_SERVER_ID).strip()
    return OpenCodeSettings(usage_server_id=server_id or DEFAULT_USAGE_SERVER_ID)


def data_dir() -> Path:
    env_data = os.environ.get("68BACKEND_DATA")
    if env_data:
        return Path(env_data).resolve()
    env_path = os.environ.get("68BACKEND_CONFIG")
    if env_path:
        return Path(env_path).resolve().parent
    return Path(__file__).resolve().parents[2] / "data"


def legacy_config_path() -> Path:
    env_path = os.environ.get("68BACKEND_CONFIG")
    if env_path:
        return Path(env_path).resolve()
    return Path(__file__).resolve().parents[2] / "config.json"


def legacy_runtime_config_path() -> Path:
    return data_dir() / "service.json"


def read_optional_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def read_optional_config_raw() -> dict[str, Any]:
    return read_optional_json(legacy_config_path())


def read_optional_runtime_config() -> dict[str, Any]:
    return read_optional_json(legacy_runtime_config_path())


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def extract_settings_payload(raw: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    refresh = raw.get("refresh")
    if isinstance(refresh, dict):
        payload["refresh"] = refresh
    usage_sync = raw.get("usage_sync")
    if isinstance(usage_sync, dict):
        payload["usage_sync"] = usage_sync
    opencode = raw.get("opencode")
    if isinstance(opencode, dict):
        payload["opencode"] = opencode
    return payload


def merge_settings_with_defaults(payload: dict[str, Any]) -> dict[str, Any]:
    return _deep_merge(DEFAULT_SETTINGS_PAYLOAD, payload)


def load_settings_payload() -> dict[str, Any]:
    from . import db

    stored = db.get_service_settings_payload()
    if not stored:
        return merge_settings_with_defaults({})
    return merge_settings_with_defaults(stored)


def save_settings_payload(payload: dict[str, Any]) -> dict[str, Any]:
    from . import db

    merged = merge_settings_with_defaults(payload)
    db.save_service_settings_payload(merged)
    return merged


def _listen_settings_from_legacy(raw: dict[str, Any]) -> tuple[str, int]:
    host = str(os.environ.get("68BACKEND_LISTEN_HOST") or raw.get("listen_host") or DEFAULT_LISTEN_HOST)
    port_raw = os.environ.get("68BACKEND_LISTEN_PORT") or raw.get("listen_port") or DEFAULT_LISTEN_PORT
    try:
        port = int(port_raw)
    except (TypeError, ValueError):
        port = DEFAULT_LISTEN_PORT
    return host, port


def load_service_config() -> ServiceConfig:
    legacy = _deep_merge(read_optional_config_raw(), read_optional_runtime_config())
    settings = load_settings_payload()
    refresh_raw = settings.get("refresh") if isinstance(settings.get("refresh"), dict) else {}
    listen_host, listen_port = _listen_settings_from_legacy(legacy)
    return ServiceConfig(
        listen_host=listen_host,
        listen_port=listen_port,
        refresh_ollama=_parse_refresh_settings(refresh_raw.get("ollama"), default_interval=300),
        refresh_opencode_go=_parse_refresh_settings(refresh_raw.get("opencode_go"), default_interval=60),
        opencode=_parse_opencode_settings(settings.get("opencode")),
        usage_sync=_parse_usage_sync_settings(settings.get("usage_sync")),
    )


def update_service_config(updates: dict[str, Any]) -> ServiceConfig:
    current = load_settings_payload()
    next_payload = dict(current)

    refresh_updates = updates.get("refresh")
    if isinstance(refresh_updates, dict):
        refresh_raw = dict(next_payload.get("refresh") or {})
        for key, value in refresh_updates.items():
            if not isinstance(value, dict):
                continue
            section = dict(refresh_raw.get(key) or {})
            if value.get("auto_refresh") is not None:
                section["auto_refresh"] = bool(value["auto_refresh"])
            if value.get("interval_sec") is not None:
                section["interval_sec"] = int(value["interval_sec"])
            refresh_raw[key] = section
        next_payload["refresh"] = refresh_raw

    usage_sync_updates = updates.get("usage_sync")
    if isinstance(usage_sync_updates, dict):
        section = dict(next_payload.get("usage_sync") or {})
        for field in ("auto_sync", "interval_sec", "backfill_pages_per_request", "max_pages_per_incremental"):
            if usage_sync_updates.get(field) is not None:
                section[field] = usage_sync_updates[field]
        next_payload["usage_sync"] = section

    opencode_updates = updates.get("opencode")
    if isinstance(opencode_updates, dict):
        section = dict(next_payload.get("opencode") or {})
        if opencode_updates.get("usage_server_id") is not None:
            section["usage_server_id"] = str(opencode_updates["usage_server_id"]).strip()
        next_payload["opencode"] = section

    save_settings_payload(next_payload)
    return load_service_config()


def _parse_accounts_from_raw(raw: dict[str, Any]) -> tuple[list[AccountConfig], list[OllamaAccountConfig]]:
    import_block = raw.get("import_accounts")
    if isinstance(import_block, dict):
        opencode_accounts_raw = import_block.get("opencode_accounts") or []
        ollama_accounts_raw = import_block.get("ollama_accounts") or []
    else:
        opencode_accounts_raw = raw.get("opencode_accounts") or []
        ollama_accounts_raw = raw.get("ollama_accounts") or []

    opencode_accounts: list[AccountConfig] = []
    for i, item in enumerate(opencode_accounts_raw):
        if not isinstance(item, dict):
            continue
        opencode_accounts.append(
            AccountConfig(
                name=str(item.get("name") or f"opencode-{i + 1}"),
                workspace_id=str(item.get("workspace_id") or "Default").strip() or "Default",
                auth_cookie=str(item.get("auth_cookie") or "").strip(),
                show_rolling=bool(item.get("show_rolling", True)),
                show_weekly=bool(item.get("show_weekly", True)),
                show_monthly=bool(item.get("show_monthly", True)),
            )
        )

    ollama_accounts: list[OllamaAccountConfig] = []
    for i, item in enumerate(ollama_accounts_raw):
        if not isinstance(item, dict):
            continue
        ollama_accounts.append(
            OllamaAccountConfig(
                name=str(item.get("name") or f"ollama-{i + 1}"),
                session_cookie=str(item.get("session_cookie") or "").strip(),
                show_session=bool(item.get("show_session", True)),
                show_weekly=bool(item.get("show_weekly", True)),
            )
        )
    return opencode_accounts, ollama_accounts


def load_config() -> AppConfig:
    from . import db
    from .bootstrap import ensure_bootstrapped

    ensure_bootstrapped()
    service = load_service_config()
    opencode_rows = db.list_opencode_accounts()
    ollama_rows = db.list_ollama_accounts()

    opencode_accounts = [
        AccountConfig(
            name=row.name,
            workspace_id=row.workspace_id,
            auth_cookie=row.auth_cookie,
            show_rolling=row.show_rolling,
            show_weekly=row.show_weekly,
            show_monthly=row.show_monthly,
        )
        for row in opencode_rows
        if row.enabled
    ]
    ollama_accounts = [
        OllamaAccountConfig(
            name=row.name,
            session_cookie=row.session_cookie,
            show_session=row.show_session,
            show_weekly=row.show_weekly,
        )
        for row in ollama_rows
        if row.enabled
    ]

    return AppConfig(
        listen_host=service.listen_host,
        listen_port=service.listen_port,
        opencode_accounts=opencode_accounts,
        ollama_accounts=ollama_accounts,
        refresh_ollama=service.refresh_ollama,
        refresh_opencode_go=service.refresh_opencode_go,
        opencode=service.opencode,
        usage_sync=service.usage_sync,
    )


def _mask_secret(value: str, prefix: str) -> str:
    secret = value.strip()
    if len(secret) <= 8:
        return f"{prefix}****"
    return f"{prefix}{secret[:4]}…{secret[-4:]}"


def mask_cookie(cookie: str) -> str:
    value = cookie.strip()
    if not value:
        return ""
    if value.lower().startswith("cookie:"):
        value = value[7:].strip()
    auth = value
    if "auth=" in value:
        for part in value.split(";"):
            part = part.strip()
            if part.startswith("auth="):
                auth = part[5:]
                break
    return _mask_secret(auth, "auth=")


def mask_ollama_cookie(cookie: str) -> str:
    value = cookie.strip()
    if not value:
        return ""
    if value.lower().startswith("cookie:"):
        value = value[7:].strip()
    if "__Secure-session=" in value:
        for part in value.split(";"):
            part = part.strip()
            if part.startswith("__Secure-session="):
                return _mask_secret(part[17:], "__Secure-session=")
    if "=" not in value:
        return _mask_secret(value, "__Secure-session=")
    return "cookie=****"
