from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from . import db
from . import sync_progress
from .config import load_service_config
from .db import OpenCodeAccountRow
from .opencode_usage import USAGE_PAGE_SIZE, fetch_usage_page, resolve_account_workspace_id

BATCH_SIZE = 5


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


async def _fetch_and_insert_batch(
    account: OpenCodeAccountRow,
    workspace_id: str,
    pages: list[int],
    inserted_total: int,
) -> tuple[int, int, int]:
    tasks = [fetch_usage_page(workspace_id=workspace_id, auth_cookie=account.auth_cookie, page=p) for p in pages]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    new_inserted = 0
    pages_done = 0
    for p, result in zip(pages, results):
        if isinstance(result, Exception):
            continue
        records = result
        if not records:
            continue
        pages_done += 1
        new_in_page = db.insert_usage_records_ignore(account.id, workspace_id, [r.to_db_dict() for r in records])
        new_inserted += new_in_page
        inserted_total += new_in_page
        sync_progress.update(account.id, p + 1, inserted_total)
        if len(records) < USAGE_PAGE_SIZE:
            return new_inserted, pages_done, -1

    # All pages in this batch returned empty/no data → nothing left to fetch
    if pages_done == 0:
        return new_inserted, pages_done, -1

    return new_inserted, pages_done, 0


async def sync_usage(account: OpenCodeAccountRow, max_pages: int | None = None) -> SyncResult:
    cfg = load_service_config().usage_sync
    pages_limit = max_pages if max_pages is not None else cfg.max_pages_per_incremental
    pages_limit = max(1, min(pages_limit, 1000))
    sync_at = _now_iso()
    inserted_total = 0
    pages_fetched = 0

    try:
        workspace_id = await _ensure_workspace(account)
        state = db.get_usage_sync_state(account.id)
        deepest = state.deepest_page_fetched

        # Phase 1: scan newest pages (0..deepest) for fresh records
        if deepest >= 0:
            for p in range(min(deepest + 1, 20)):
                records = await fetch_usage_page(workspace_id=workspace_id, auth_cookie=account.auth_cookie, page=p)
                if not records:
                    break
                pages_fetched += 1
                new_in_page = db.insert_usage_records_ignore(account.id, workspace_id, [r.to_db_dict() for r in records])
                inserted_total += new_in_page
                if new_in_page == 0:
                    break
                if len(records) < USAGE_PAGE_SIZE:
                    break

        # Phase 2: fetch deeper pages with concurrency
        start_page = max(0, deepest + 1)
        page = start_page

        sync_progress.start(account.id, pages_limit)

        while page - start_page < pages_limit:
            remaining = pages_limit - (page - start_page)
            batch_size = min(BATCH_SIZE, remaining)
            batch_pages = list(range(page, page + batch_size))

            _, pages_done, stop_signal = await _fetch_and_insert_batch(account, workspace_id, batch_pages, inserted_total)
            pages_fetched += pages_done
            page += batch_size

            if stop_signal < 0:
                break

        deepest = max(deepest, page - 1) if pages_fetched else deepest
        db.update_usage_sync_state(account.id, last_sync_at=sync_at, last_sync_status="ok", last_sync_error=None, last_inserted_count=inserted_total, deepest_page_fetched=deepest)
        db.refresh_usage_sync_totals(account.id)
        sync_progress.finish(account.id, inserted_total)
        return SyncResult(inserted=inserted_total, pages_fetched=pages_fetched, sync_at=sync_at)
    except Exception as exc:
        sync_progress.error(account.id, str(exc))
        db.update_usage_sync_state(account.id, last_sync_at=sync_at, last_sync_status="error", last_sync_error=str(exc), last_inserted_count=0)
        raise


async def backfill_usage(account: OpenCodeAccountRow, max_pages: int | None = None) -> SyncResult:
    cfg = load_service_config().usage_sync
    pages_limit = max_pages if max_pages is not None else cfg.backfill_pages_per_request
    pages_limit = max(1, min(pages_limit, 1000))
    sync_at = _now_iso()
    inserted_total = 0
    pages_fetched = 0

    try:
        workspace_id = await _ensure_workspace(account)
        state = db.get_usage_sync_state(account.id)
        start_page = state.deepest_page_fetched + 1 if state.deepest_page_fetched >= 0 else 0
        page = start_page

        sync_progress.start(account.id, pages_limit)

        while page - start_page < pages_limit:
            remaining = pages_limit - (page - start_page)
            batch_size = min(BATCH_SIZE, remaining)
            batch_pages = list(range(page, page + batch_size))

            new_inserted, pages_done, stop_signal = await _fetch_and_insert_batch(account, workspace_id, batch_pages, inserted_total)
            inserted_total += new_inserted
            pages_fetched += pages_done
            page += batch_size

            for p in batch_pages[:pages_done]:
                db.update_usage_sync_state(account.id, deepest_page_fetched=p)

            if stop_signal < 0:
                break

        db.refresh_usage_sync_totals(account.id)
        db.update_usage_sync_state(account.id, last_sync_at=sync_at, last_sync_status="ok", last_sync_error=None, last_inserted_count=inserted_total)
        sync_progress.finish(account.id, inserted_total)
        return SyncResult(inserted=inserted_total, pages_fetched=pages_fetched, sync_at=sync_at)
    except Exception as exc:
        sync_progress.error(account.id, str(exc))
        db.update_usage_sync_state(account.id, last_sync_at=sync_at, last_sync_status="error", last_sync_error=str(exc), last_inserted_count=0)
        raise
