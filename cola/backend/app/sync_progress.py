from __future__ import annotations

import asyncio
import time
from typing import Any

_progress: dict[str, dict[str, Any]] = {}


def start(account_id: str, total_pages: int) -> None:
    _progress[account_id] = {
        "current": 0,
        "total": total_pages,
        "inserted": 0,
        "status": "running",
        "updated_at": time.time(),
    }


def update(account_id: str, current: int, inserted: int) -> None:
    entry = _progress.get(account_id)
    if entry is None:
        return
    entry["current"] = current
    entry["inserted"] = inserted
    entry["updated_at"] = time.time()


def finish(account_id: str, inserted: int) -> None:
    entry = _progress.get(account_id)
    if entry is None:
        return
    entry["current"] = entry["total"]
    entry["inserted"] = inserted
    entry["status"] = "done"
    entry["updated_at"] = time.time()


def error(account_id: str, message: str) -> None:
    entry = _progress.get(account_id)
    if entry is None:
        return
    entry["status"] = "error"
    entry["error"] = message
    entry["updated_at"] = time.time()


def get(account_id: str) -> dict[str, Any]:
    entry = _progress.get(account_id)
    if entry is None:
        return {"status": "idle", "current": 0, "total": 0, "inserted": 0}
    result = dict(entry)
    if time.time() - result.get("updated_at", 0) > 30:
        result["status"] = "timeout"
    return result


def cleanup_expired() -> None:
    now = time.time()
    to_delete = [k for k, v in _progress.items() if now - v.get("updated_at", 0) > 120]
    for k in to_delete:
        del _progress[k]
