from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from . import db
from .config import load_service_config
from .db import OpenCodeAccountRow
from .opencode_usage import USAGE_PAGE_SIZE, fetch_usage_page, resolve_account_workspace_id


@dataclass
class SyncResult:
    inserted: int
    pages_fetched: int
    sync_at: str
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "inserted": self.inserted,
            "pages_fetched": self.pages_fetched,
            "sync_at": self.sync_at,
        }
        if self.error:
            payload["error"] = self.error
        return payload


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


async def _ensure_workspace(account: OpenCodeAccountRow) -> str:
    workspace_id = await resolve_account_workspace_id(
        account.workspace_id,
        account.auth_cookie,
        account.resolved_workspace_id,
    )
    if workspace_id != account.resolved_workspace_id:
        db.update_opencode_account(account.id, resolved_workspace_id=workspace_id)
    return workspace_id


async def sync_usage(account: OpenCodeAccountRow, max_pages: int | None = None) -> SyncResult:
    cfg = load_service_config().usage_sync
    pages_limit = max_pages if max_pages is not None else cfg.max_pages_per_incremental
    pages_limit = max(1, min(pages_limit, 100))
    sync_at = _now_iso()
    inserted_total = 0
    pages_fetched = 0

    try:
        workspace_id = await _ensure_workspace(account)
        state = db.get_usage_sync_state(account.id)
        deepest = state.deepest_page_fetched

        newest_page = 0
        if deepest >= 0:
            for p in range(deepest + 1):
                records = await fetch_usage_page(
                    workspace_id=workspace_id,
                    auth_cookie=account.auth_cookie,
                    page=p,
                )
                if not records:
                    break
                pages_fetched += 1
                new_in_page = db.insert_usage_records_ignore(
                    account.id,
                    workspace_id,
                    [r.to_db_dict() for r in records],
                )
                inserted_total += new_in_page
                if len(records) < USAGE_PAGE_SIZE:
                    break
                newest_page = p

        start_page = max(newest_page, deepest + 1 if deepest >= 0 else 0)
        page = start_page
        while page - start_page < pages_limit:
            records = await fetch_usage_page(
                workspace_id=workspace_id,
                auth_cookie=account.auth_cookie,
                page=page,
            )
            if not records:
                break
            pages_fetched += 1
            new_in_page = db.insert_usage_records_ignore(
                account.id,
                workspace_id,
                [r.to_db_dict() for r in records],
            )
            inserted_total += new_in_page
            if len(records) < USAGE_PAGE_SIZE:
                break
            page += 1

        deepest = max(deepest, page) if pages_fetched else deepest
        db.update_usage_sync_state(
            account.id,
            last_sync_at=sync_at,
            last_sync_status="ok",
            last_sync_error=None,
            last_inserted_count=inserted_total,
            deepest_page_fetched=deepest,
        )
        db.refresh_usage_sync_totals(account.id)
        return SyncResult(inserted=inserted_total, pages_fetched=pages_fetched, sync_at=sync_at)
    except Exception as exc:
        db.update_usage_sync_state(
            account.id,
            last_sync_at=sync_at,
            last_sync_status="error",
            last_sync_error=str(exc),
            last_inserted_count=0,
        )
        raise


async def backfill_usage(account: OpenCodeAccountRow, max_pages: int | None = None) -> SyncResult:
    cfg = load_service_config().usage_sync
    pages_limit = max_pages if max_pages is not None else cfg.backfill_pages_per_request
    pages_limit = max(1, min(pages_limit, 100))
    sync_at = _now_iso()
    inserted_total = 0
    pages_fetched = 0

    try:
        workspace_id = await _ensure_workspace(account)
        state = db.get_usage_sync_state(account.id)
        start_page = state.deepest_page_fetched + 1 if state.deepest_page_fetched >= 0 else 0
        page = start_page

        for _ in range(pages_limit):
            records = await fetch_usage_page(
                workspace_id=workspace_id,
                auth_cookie=account.auth_cookie,
                page=page,
            )
            if not records:
                break
            pages_fetched += 1
            new_in_page = db.insert_usage_records_ignore(
                account.id,
                workspace_id,
                [r.to_db_dict() for r in records],
            )
            inserted_total += new_in_page
            db.update_usage_sync_state(account.id, deepest_page_fetched=page)
            if len(records) < USAGE_PAGE_SIZE:
                break
            page += 1

        db.refresh_usage_sync_totals(account.id)
        db.update_usage_sync_state(
            account.id,
            last_sync_at=sync_at,
            last_sync_status="ok",
            last_sync_error=None,
            last_inserted_count=inserted_total,
        )
        return SyncResult(inserted=inserted_total, pages_fetched=pages_fetched, sync_at=sync_at)
    except Exception as exc:
        db.update_usage_sync_state(
            account.id,
            last_sync_at=sync_at,
            last_sync_status="error",
            last_sync_error=str(exc),
            last_inserted_count=0,
        )
        raise
