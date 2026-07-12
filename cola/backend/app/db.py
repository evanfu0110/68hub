from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator

from .config import data_dir


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def db_path() -> Path:
    return data_dir() / "68backend.db"


def imported_flag_path() -> Path:
    return data_dir() / ".imported"


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS opencode_accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                workspace_id TEXT NOT NULL DEFAULT 'Default',
                resolved_workspace_id TEXT,
                auth_cookie TEXT NOT NULL,
                show_rolling INTEGER NOT NULL DEFAULT 1,
                show_weekly INTEGER NOT NULL DEFAULT 1,
                show_monthly INTEGER NOT NULL DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ollama_accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                session_cookie TEXT NOT NULL,
                show_session INTEGER NOT NULL DEFAULT 1,
                show_weekly INTEGER NOT NULL DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS usage_records (
                usg_id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL REFERENCES opencode_accounts(id) ON DELETE CASCADE,
                workspace_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                model TEXT NOT NULL,
                provider TEXT,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                cost_raw INTEGER NOT NULL,
                cost_usd REAL NOT NULL,
                key_id TEXT,
                plan TEXT,
                synced_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_usage_account_time
                ON usage_records(account_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_usage_account_key
                ON usage_records(account_id, key_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS usage_sync_state (
                account_id TEXT PRIMARY KEY REFERENCES opencode_accounts(id) ON DELETE CASCADE,
                last_sync_at TEXT,
                last_sync_status TEXT,
                last_sync_error TEXT,
                last_inserted_count INTEGER NOT NULL DEFAULT 0,
                deepest_page_fetched INTEGER NOT NULL DEFAULT -1,
                total_records INTEGER NOT NULL DEFAULT 0,
                oldest_record_at TEXT,
                newest_record_at TEXT
            );

            CREATE TABLE IF NOT EXISTS service_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )


@dataclass
class OpenCodeAccountRow:
    id: str
    name: str
    workspace_id: str
    resolved_workspace_id: str | None
    auth_cookie: str
    show_rolling: bool
    show_weekly: bool
    show_monthly: bool
    enabled: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> OpenCodeAccountRow:
        return cls(
            id=row["id"],
            name=row["name"],
            workspace_id=row["workspace_id"],
            resolved_workspace_id=row["resolved_workspace_id"],
            auth_cookie=row["auth_cookie"],
            show_rolling=bool(row["show_rolling"]),
            show_weekly=bool(row["show_weekly"]),
            show_monthly=bool(row["show_monthly"]),
            enabled=bool(row["enabled"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


@dataclass
class OllamaAccountRow:
    id: str
    name: str
    session_cookie: str
    show_session: bool
    show_weekly: bool
    enabled: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> OllamaAccountRow:
        return cls(
            id=row["id"],
            name=row["name"],
            session_cookie=row["session_cookie"],
            show_session=bool(row["show_session"]),
            show_weekly=bool(row["show_weekly"]),
            enabled=bool(row["enabled"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


@dataclass
class UsageRecordRow:
    usg_id: str
    account_id: str
    workspace_id: str
    created_at: str
    model: str
    provider: str | None
    input_tokens: int
    output_tokens: int
    cost_raw: int
    cost_usd: float
    key_id: str | None
    plan: str | None
    synced_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "usg_id": self.usg_id,
            "account_id": self.account_id,
            "created_at": self.created_at,
            "model": self.model,
            "provider": self.provider,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": self.cost_usd,
            "key_id": self.key_id,
            "plan": self.plan,
        }


@dataclass
class UsageRecordWithAccount(UsageRecordRow):
    account_name: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload = super().to_dict()
        payload["account_name"] = self.account_name
        return payload


@dataclass
class UsageSyncStateRow:
    account_id: str
    last_sync_at: str | None
    last_sync_status: str | None
    last_sync_error: str | None
    last_inserted_count: int
    deepest_page_fetched: int
    total_records: int
    oldest_record_at: str | None
    newest_record_at: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "last_sync_at": self.last_sync_at,
            "last_sync_status": self.last_sync_status,
            "last_sync_error": self.last_sync_error,
            "last_inserted_count": self.last_inserted_count,
            "deepest_page_fetched": self.deepest_page_fetched,
            "total_records": self.total_records,
            "oldest_record_at": self.oldest_record_at,
            "newest_record_at": self.newest_record_at,
        }

    @classmethod
    def from_row(cls, row: sqlite3.Row | None, account_id: str) -> UsageSyncStateRow:
        if row is None:
            return cls(
                account_id=account_id,
                last_sync_at=None,
                last_sync_status=None,
                last_sync_error=None,
                last_inserted_count=0,
                deepest_page_fetched=-1,
                total_records=0,
                oldest_record_at=None,
                newest_record_at=None,
            )
        return cls(
            account_id=account_id,
            last_sync_at=row["last_sync_at"],
            last_sync_status=row["last_sync_status"],
            last_sync_error=row["last_sync_error"],
            last_inserted_count=int(row["last_inserted_count"]),
            deepest_page_fetched=int(row["deepest_page_fetched"]),
            total_records=int(row["total_records"]),
            oldest_record_at=row["oldest_record_at"],
            newest_record_at=row["newest_record_at"],
        )


def list_opencode_accounts(*, enabled_only: bool = False) -> list[OpenCodeAccountRow]:
    with get_conn() as conn:
        sql = "SELECT * FROM opencode_accounts"
        if enabled_only:
            sql += " WHERE enabled = 1"
        sql += " ORDER BY created_at ASC"
        rows = conn.execute(sql).fetchall()
    return [OpenCodeAccountRow.from_row(r) for r in rows]


def get_opencode_account(account_id: str) -> OpenCodeAccountRow | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM opencode_accounts WHERE id = ?", (account_id,)
        ).fetchone()
    return OpenCodeAccountRow.from_row(row) if row else None


def create_opencode_account(
    *,
    name: str,
    workspace_id: str,
    auth_cookie: str,
    show_rolling: bool = True,
    show_weekly: bool = True,
    show_monthly: bool = True,
    enabled: bool = True,
) -> OpenCodeAccountRow:
    account_id = str(uuid.uuid4())
    now = _now_iso()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO opencode_accounts (
                id, name, workspace_id, resolved_workspace_id, auth_cookie,
                show_rolling, show_weekly, show_monthly, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                name,
                workspace_id,
                auth_cookie,
                int(show_rolling),
                int(show_weekly),
                int(show_monthly),
                int(enabled),
                now,
                now,
            ),
        )
        conn.execute(
            "INSERT INTO usage_sync_state (account_id) VALUES (?)",
            (account_id,),
        )
    account = get_opencode_account(account_id)
    assert account is not None
    return account


def update_opencode_account(account_id: str, **fields: Any) -> OpenCodeAccountRow | None:
    allowed = {
        "name",
        "workspace_id",
        "resolved_workspace_id",
        "auth_cookie",
        "show_rolling",
        "show_weekly",
        "show_monthly",
        "enabled",
    }
    updates: list[str] = []
    values: list[Any] = []
    for key, value in fields.items():
        if key not in allowed or value is None:
            continue
        if key in {"show_rolling", "show_weekly", "show_monthly", "enabled"}:
            value = int(bool(value))
        updates.append(f"{key} = ?")
        values.append(value)
    if not updates:
        return get_opencode_account(account_id)
    updates.append("updated_at = ?")
    values.append(_now_iso())
    values.append(account_id)
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE opencode_accounts SET {', '.join(updates)} WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            return None
    return get_opencode_account(account_id)


def delete_opencode_account(account_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM opencode_accounts WHERE id = ?", (account_id,))
        return cur.rowcount > 0


def list_ollama_accounts(*, enabled_only: bool = False) -> list[OllamaAccountRow]:
    with get_conn() as conn:
        sql = "SELECT * FROM ollama_accounts"
        if enabled_only:
            sql += " WHERE enabled = 1"
        sql += " ORDER BY created_at ASC"
        rows = conn.execute(sql).fetchall()
    return [OllamaAccountRow.from_row(r) for r in rows]


def get_ollama_account(account_id: str) -> OllamaAccountRow | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM ollama_accounts WHERE id = ?", (account_id,)
        ).fetchone()
    return OllamaAccountRow.from_row(row) if row else None


def create_ollama_account(
    *,
    name: str,
    session_cookie: str,
    show_session: bool = True,
    show_weekly: bool = True,
    enabled: bool = True,
) -> OllamaAccountRow:
    account_id = str(uuid.uuid4())
    now = _now_iso()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO ollama_accounts (
                id, name, session_cookie, show_session, show_weekly, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                name,
                session_cookie,
                int(show_session),
                int(show_weekly),
                int(enabled),
                now,
                now,
            ),
        )
    account = get_ollama_account(account_id)
    assert account is not None
    return account


def update_ollama_account(account_id: str, **fields: Any) -> OllamaAccountRow | None:
    allowed = {"name", "session_cookie", "show_session", "show_weekly", "enabled"}
    updates: list[str] = []
    values: list[Any] = []
    for key, value in fields.items():
        if key not in allowed or value is None:
            continue
        if key in {"show_session", "show_weekly", "enabled"}:
            value = int(bool(value))
        updates.append(f"{key} = ?")
        values.append(value)
    if not updates:
        return get_ollama_account(account_id)
    updates.append("updated_at = ?")
    values.append(_now_iso())
    values.append(account_id)
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE ollama_accounts SET {', '.join(updates)} WHERE id = ?",
            values,
        )
        if cur.rowcount == 0:
            return None
    return get_ollama_account(account_id)


def delete_ollama_account(account_id: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM ollama_accounts WHERE id = ?", (account_id,))
        return cur.rowcount > 0


def insert_usage_records_ignore(
    account_id: str, workspace_id: str, records: list[dict[str, Any]]
) -> int:
    if not records:
        return 0
    synced_at = _now_iso()
    inserted = 0
    with get_conn() as conn:
        for rec in records:
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO usage_records (
                    usg_id, account_id, workspace_id, created_at, model, provider,
                    input_tokens, output_tokens, cost_raw, cost_usd, key_id, plan, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rec["usg_id"],
                    account_id,
                    workspace_id,
                    rec["created_at"],
                    rec["model"],
                    rec.get("provider"),
                    rec["input_tokens"],
                    rec["output_tokens"],
                    rec["cost_raw"],
                    rec["cost_usd"],
                    rec.get("key_id"),
                    rec.get("plan"),
                    synced_at,
                ),
            )
            inserted += cur.rowcount
    return inserted


def list_usage_records(
    account_id: str,
    *,
    offset: int = 0,
    limit: int = 50,
    key_id: str | None = None,
) -> tuple[list[UsageRecordRow], int]:
    offset = max(0, offset)
    limit = max(1, min(limit, 200))
    where = "WHERE account_id = ?"
    params: list[Any] = [account_id]
    if key_id:
        where += " AND key_id = ?"
        params.append(key_id)
    with get_conn() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM usage_records {where}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT * FROM usage_records {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()
    records = [
        UsageRecordRow(
            usg_id=r["usg_id"],
            account_id=r["account_id"],
            workspace_id=r["workspace_id"],
            created_at=r["created_at"],
            model=r["model"],
            provider=r["provider"],
            input_tokens=r["input_tokens"],
            output_tokens=r["output_tokens"],
            cost_raw=r["cost_raw"],
            cost_usd=r["cost_usd"],
            key_id=r["key_id"],
            plan=r["plan"],
            synced_at=r["synced_at"],
        )
        for r in rows
    ]
    return records, int(total)


def list_usage_key_ids(account_id: str) -> list[str]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT key_id FROM usage_records
            WHERE account_id = ? AND key_id IS NOT NULL AND key_id != ''
            ORDER BY key_id
            """,
            (account_id,),
        ).fetchall()
    return [r["key_id"] for r in rows]


def list_all_usage_records(
    *,
    offset: int = 0,
    limit: int = 50,
    account_id: str | None = None,
) -> tuple[list[UsageRecordWithAccount], int]:
    offset = max(0, offset)
    limit = max(1, min(limit, 200))
    where = ""
    params: list[Any] = []
    if account_id:
        where = "WHERE ur.account_id = ?"
        params.append(account_id)
    with get_conn() as conn:
        total = conn.execute(
            f"""
            SELECT COUNT(*) FROM usage_records ur
            JOIN opencode_accounts oa ON oa.id = ur.account_id
            {where}
            """,
            params,
        ).fetchone()[0]
        rows = conn.execute(
            f"""
            SELECT ur.*, oa.name AS account_name
            FROM usage_records ur
            JOIN opencode_accounts oa ON oa.id = ur.account_id
            {where}
            ORDER BY ur.created_at DESC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()
    records = [
        UsageRecordWithAccount(
            usg_id=r["usg_id"],
            account_id=r["account_id"],
            workspace_id=r["workspace_id"],
            created_at=r["created_at"],
            model=r["model"],
            provider=r["provider"],
            input_tokens=r["input_tokens"],
            output_tokens=r["output_tokens"],
            cost_raw=r["cost_raw"],
            cost_usd=r["cost_usd"],
            key_id=r["key_id"],
            plan=r["plan"],
            synced_at=r["synced_at"],
            account_name=r["account_name"],
        )
        for r in rows
    ]
    return records, int(total)


def opencode_daily_stats(days: int = 30, account_id: str | None = None) -> list[dict[str, Any]]:
    days = max(1, min(days, 365))
    where = "WHERE substr(created_at, 1, 10) >= date('now', ?)"
    params: list[Any] = [f"-{days} days"]
    if account_id:
        where += " AND account_id = ?"
        params.append(account_id)
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT substr(created_at, 1, 10) AS date,
                   SUM(cost_usd) AS total_cost_usd,
                   COUNT(*) AS request_count
            FROM usage_records
            {where}
            GROUP BY substr(created_at, 1, 10)
            ORDER BY date DESC
            """,
            params,
        ).fetchall()
    return [
        {
            "date": r["date"],
            "total_cost_usd": round(float(r["total_cost_usd"] or 0), 6),
            "request_count": int(r["request_count"]),
        }
        for r in rows
    ]


def opencode_daily_model_stats(days: int = 30, account_id: str | None = None) -> list[dict[str, Any]]:
    days = max(1, min(days, 365))
    where = "WHERE substr(created_at, 1, 10) >= date('now', ?)"
    params: list[Any] = [f"-{days} days"]
    if account_id:
        where += " AND account_id = ?"
        params.append(account_id)
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT substr(created_at, 1, 10) AS date,
                   model,
                   SUM(cost_usd) AS total_cost_usd,
                   COUNT(*) AS request_count
            FROM usage_records
            {where}
            GROUP BY substr(created_at, 1, 10), model
            ORDER BY date ASC, model ASC
            """,
            params,
        ).fetchall()
    return [
        {
            "date": r["date"],
            "model": r["model"],
            "total_cost_usd": round(float(r["total_cost_usd"] or 0), 6),
            "request_count": int(r["request_count"]),
        }
        for r in rows
    ]


def get_usage_sync_state(account_id: str) -> UsageSyncStateRow:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM usage_sync_state WHERE account_id = ?", (account_id,)
        ).fetchone()
    return UsageSyncStateRow.from_row(row, account_id)


def update_usage_sync_state(account_id: str, **fields: Any) -> None:
    allowed = {
        "last_sync_at",
        "last_sync_status",
        "last_sync_error",
        "last_inserted_count",
        "deepest_page_fetched",
        "total_records",
        "oldest_record_at",
        "newest_record_at",
    }
    updates: list[str] = []
    values: list[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        updates.append(f"{key} = ?")
        values.append(value)
    if not updates:
        return
    values.append(account_id)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE usage_sync_state SET {', '.join(updates)} WHERE account_id = ?",
            values,
        )


def refresh_usage_sync_totals(account_id: str) -> None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   MIN(created_at) AS oldest,
                   MAX(created_at) AS newest
            FROM usage_records WHERE account_id = ?
            """,
            (account_id,),
        ).fetchone()
        conn.execute(
            """
            UPDATE usage_sync_state
            SET total_records = ?, oldest_record_at = ?, newest_record_at = ?
            WHERE account_id = ?
            """,
            (row["total"], row["oldest"], row["newest"], account_id),
        )


def has_service_settings() -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT 1 FROM service_settings WHERE id = 1").fetchone()
    return row is not None


def get_service_settings_payload() -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT payload FROM service_settings WHERE id = 1").fetchone()
    if row is None:
        return {}
    try:
        data = json.loads(row["payload"])
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def save_service_settings_payload(payload: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO service_settings (id, payload, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (json.dumps(payload, ensure_ascii=False), _now_iso()),
        )


def opencode_model_token_stats(
    period: str = "30d",
    account_id: str | None = None,
) -> list[dict[str, Any]]:
    if period == "5h":
        where = "WHERE datetime(created_at) >= datetime('now', '-5 hours')"
    elif period == "7d":
        where = "WHERE datetime(created_at) >= datetime('now', '-7 days')"
    else:
        where = "WHERE datetime(created_at) >= datetime('now', '-30 days')"
    params: list[Any] = []
    if account_id:
        where += " AND account_id = ?"
        params.append(account_id)
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT model,
                   COUNT(*) AS request_count,
                   SUM(input_tokens) AS total_input_tokens,
                   SUM(output_tokens) AS total_output_tokens,
                   SUM(cost_usd) AS total_cost_usd
            FROM usage_records
            {where}
            GROUP BY model
            ORDER BY (total_input_tokens + total_output_tokens) DESC
            """,
            params,
        ).fetchall()
    return [
        {
            "model": r["model"],
            "request_count": int(r["request_count"]),
            "total_input_tokens": int(r["total_input_tokens"] or 0),
            "total_output_tokens": int(r["total_output_tokens"] or 0),
            "total_cost_usd": round(float(r["total_cost_usd"] or 0), 6),
        }
        for r in rows
    ]


def count_opencode_accounts() -> int:
    with get_conn() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM opencode_accounts").fetchone()[0])


def count_ollama_accounts() -> int:
    with get_conn() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM ollama_accounts").fetchone()[0])
