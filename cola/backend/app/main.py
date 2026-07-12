from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from . import db
from .bootstrap import ensure_bootstrapped
from .analytics import build_overview
from .config import load_config, load_service_config, mask_cookie, mask_ollama_cookie, update_service_config
from .ollama_quota import fetch_all_ollama_quotas
from .opencode_usage import resolve_account_workspace_id
from .quota import fetch_all_quotas, fetch_quota_for_account
from .schemas import (
    OllamaAccountCreate,
    OllamaAccountUpdate,
    OpenCodeAccountCreate,
    OpenCodeAccountUpdate,
    ServiceConfigUpdate,
)
from . import sync_progress
from .usage_sync import backfill_usage, sync_usage

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

_sync_task: asyncio.Task[None] | None = None


async def restart_usage_sync_task() -> None:
    global _sync_task
    if _sync_task is not None:
        _sync_task.cancel()
        try:
            await _sync_task
        except asyncio.CancelledError:
            pass
        _sync_task = None
    service = load_service_config()
    if service.usage_sync.auto_sync:
        _sync_task = asyncio.create_task(_usage_auto_sync_loop())


async def _usage_auto_sync_loop() -> None:
    while True:
        service = load_service_config()
        settings = service.usage_sync
        if not settings.auto_sync:
            await asyncio.sleep(30)
            continue
        accounts = db.list_opencode_accounts(enabled_only=True)
        for account in accounts:
            try:
                await sync_usage(account, max_pages=5)
            except Exception:
                pass
        await asyncio.sleep(settings.interval_sec)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _sync_task
    ensure_bootstrapped()
    service = load_service_config()
    if service.usage_sync.auto_sync:
        _sync_task = asyncio.create_task(_usage_auto_sync_loop())
    yield
    if _sync_task is not None:
        _sync_task.cancel()
        try:
            await _sync_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="68backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

accounts_router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _opencode_account_dict(row: db.OpenCodeAccountRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "workspace_id": row.workspace_id,
        "resolved_workspace_id": row.resolved_workspace_id,
        "auth_cookie_masked": mask_cookie(row.auth_cookie),
        "configured": bool(row.auth_cookie.strip()),
        "show_rolling": row.show_rolling,
        "show_weekly": row.show_weekly,
        "show_monthly": row.show_monthly,
        "enabled": row.enabled,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _ollama_account_dict(row: db.OllamaAccountRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "session_cookie_masked": mask_ollama_cookie(row.session_cookie),
        "configured": bool(row.session_cookie.strip()),
        "show_session": row.show_session,
        "show_weekly": row.show_weekly,
        "enabled": row.enabled,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _build_config_response() -> dict[str, Any]:
    service = load_service_config()
    return {
        "refresh": {
            "ollama": {
                "auto_refresh": service.refresh_ollama.auto_refresh,
                "interval_sec": service.refresh_ollama.interval_sec,
            },
            "opencode_go": {
                "auto_refresh": service.refresh_opencode_go.auto_refresh,
                "interval_sec": service.refresh_opencode_go.interval_sec,
            },
        },
        "usage_sync": {
            "auto_sync": service.usage_sync.auto_sync,
            "interval_sec": service.usage_sync.interval_sec,
            "backfill_pages_per_request": service.usage_sync.backfill_pages_per_request,
            "max_pages_per_incremental": service.usage_sync.max_pages_per_incremental,
        },
        "accounts_imported": db.imported_flag_path().exists()
        or db.count_opencode_accounts() > 0
        or db.count_ollama_accounts() > 0,
        "opencode_accounts": [_opencode_account_dict(row) for row in db.list_opencode_accounts()],
        "ollama_accounts": [_ollama_account_dict(row) for row in db.list_ollama_accounts()],
    }


@accounts_router.get("/opencode")
async def list_opencode_accounts() -> list[dict[str, Any]]:
    return [_opencode_account_dict(row) for row in db.list_opencode_accounts()]


@accounts_router.post("/opencode")
async def create_opencode_account(body: OpenCodeAccountCreate) -> dict[str, Any]:
    if not body.auth_cookie.strip():
        raise HTTPException(status_code=400, detail="auth_cookie 不能为空")
    row = db.create_opencode_account(
        name=body.name.strip() or "OpenCode",
        workspace_id=body.workspace_id.strip() or "Default",
        auth_cookie=body.auth_cookie.strip(),
        show_rolling=body.show_rolling,
        show_weekly=body.show_weekly,
        show_monthly=body.show_monthly,
        enabled=body.enabled,
    )
    return _opencode_account_dict(row)


@accounts_router.get("/opencode/{account_id}")
async def get_opencode_account(account_id: str) -> dict[str, Any]:
    row = db.get_opencode_account(account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    return _opencode_account_dict(row)


@accounts_router.put("/opencode/{account_id}")
async def update_opencode_account(account_id: str, body: OpenCodeAccountUpdate) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip() or "OpenCode"
    if "workspace_id" in fields and fields["workspace_id"] is not None:
        fields["workspace_id"] = fields["workspace_id"].strip() or "Default"
        fields["resolved_workspace_id"] = None
    if "auth_cookie" in fields and fields["auth_cookie"] is not None:
        fields["auth_cookie"] = fields["auth_cookie"].strip()
    row = db.update_opencode_account(account_id, **fields)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    return _opencode_account_dict(row)


@accounts_router.delete("/opencode/{account_id}")
async def delete_opencode_account(account_id: str) -> dict[str, bool]:
    if not db.delete_opencode_account(account_id):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"ok": True}


@accounts_router.post("/opencode/{account_id}/test")
async def test_opencode_account(account_id: str) -> dict[str, Any]:
    row = db.get_opencode_account(account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    try:
        workspace_id = await resolve_account_workspace_id(
            row.workspace_id,
            row.auth_cookie,
            row.resolved_workspace_id,
        )
        db.update_opencode_account(account_id, resolved_workspace_id=workspace_id)
        return {"success": True, "workspace_id": workspace_id}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@accounts_router.get("/opencode/{account_id}/quota")
async def opencode_account_quota(account_id: str) -> dict[str, Any]:
    row = db.get_opencode_account(account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    from .config import AccountConfig

    account = AccountConfig(
        name=row.name,
        workspace_id=row.workspace_id,
        auth_cookie=row.auth_cookie,
        show_rolling=row.show_rolling,
        show_weekly=row.show_weekly,
        show_monthly=row.show_monthly,
    )
    quota = await fetch_quota_for_account(account, 0)
    return quota.to_dict()


@accounts_router.get("/opencode/{account_id}/usage")
async def list_account_usage(
    account_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    key_id: str | None = None,
) -> dict[str, Any]:
    if db.get_opencode_account(account_id) is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    records, total = db.list_usage_records(account_id, offset=offset, limit=limit, key_id=key_id)
    sync = db.get_usage_sync_state(account_id)
    return {
        "records": [r.to_dict() for r in records],
        "total": total,
        "offset": offset,
        "limit": limit,
        "key_ids": db.list_usage_key_ids(account_id),
        "sync": sync.to_dict(),
    }


@accounts_router.get("/opencode/{account_id}/usage/status")
async def usage_sync_status(account_id: str) -> dict[str, Any]:
    if db.get_opencode_account(account_id) is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    return db.get_usage_sync_state(account_id).to_dict()


@accounts_router.post("/opencode/{account_id}/usage/sync")
async def usage_sync(
    account_id: str,
    pages: int = Query(30, ge=1, le=100),
) -> dict[str, Any]:
    row = db.get_opencode_account(account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    try:
        result = await sync_usage(row, max_pages=pages)
        return result.to_dict()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@accounts_router.post("/opencode/{account_id}/usage/backfill")
async def usage_backfill(
    account_id: str,
    pages: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    row = db.get_opencode_account(account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    try:
        result = await backfill_usage(row, max_pages=pages)
        return result.to_dict()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@accounts_router.get("/opencode/{account_id}/usage/progress")
async def usage_sync_progress(account_id: str) -> dict[str, Any]:
    return sync_progress.get(account_id) if db.get_opencode_account(account_id) else {"status": "idle", "current": 0, "total": 0, "inserted": 0}


@accounts_router.get("/ollama")
async def list_ollama_accounts() -> list[dict[str, Any]]:
    return [_ollama_account_dict(row) for row in db.list_ollama_accounts()]


@accounts_router.post("/ollama")
async def create_ollama_account(body: OllamaAccountCreate) -> dict[str, Any]:
    if not body.session_cookie.strip():
        raise HTTPException(status_code=400, detail="session_cookie 不能为空")
    row = db.create_ollama_account(
        name=body.name.strip() or "Ollama",
        session_cookie=body.session_cookie.strip(),
        show_session=body.show_session,
        show_weekly=body.show_weekly,
        enabled=body.enabled,
    )
    return _ollama_account_dict(row)


@accounts_router.put("/ollama/{account_id}")
async def update_ollama_account(account_id: str, body: OllamaAccountUpdate) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip() or "Ollama"
    if "session_cookie" in fields and fields["session_cookie"] is not None:
        fields["session_cookie"] = fields["session_cookie"].strip()
    row = db.update_ollama_account(account_id, **fields)
    if row is None:
        raise HTTPException(status_code=404, detail="账号不存在")
    return _ollama_account_dict(row)


@accounts_router.delete("/ollama/{account_id}")
async def delete_ollama_account(account_id: str) -> dict[str, bool]:
    if not db.delete_ollama_account(account_id):
        raise HTTPException(status_code=404, detail="账号不存在")
    return {"ok": True}


app.include_router(accounts_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/quota")
async def quota() -> list[dict]:
    try:
        cfg = load_config()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    rows = db.list_opencode_accounts(enabled_only=True)
    if not rows:
        return []
    from .config import AccountConfig

    accounts = [
        AccountConfig(
            name=row.name,
            workspace_id=row.workspace_id,
            auth_cookie=row.auth_cookie,
            show_rolling=row.show_rolling,
            show_weekly=row.show_weekly,
            show_monthly=row.show_monthly,
        )
        for row in rows
    ]
    results = await fetch_all_quotas(accounts)
    id_by_name = {row.name: row.id for row in rows}
    for item in results:
        item["account_id"] = id_by_name.get(item.get("name", ""))
    return results


@app.get("/api/ollama/quota")
async def ollama_quota() -> list[dict]:
    try:
        cfg = load_config()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    rows = db.list_ollama_accounts(enabled_only=True)
    if not rows:
        return []
    from .config import OllamaAccountConfig

    accounts = [
        OllamaAccountConfig(
            name=row.name,
            session_cookie=row.session_cookie,
            show_session=row.show_session,
            show_weekly=row.show_weekly,
        )
        for row in rows
    ]
    results = await fetch_all_ollama_quotas(accounts)
    id_by_name = {row.name: row.id for row in rows}
    for item in results:
        item["account_id"] = id_by_name.get(item.get("name", ""))
    return results


@app.get("/api/dashboard")
async def dashboard(period: str = Query("30d", pattern=r"^(5h|7d|30d)$")) -> dict[str, Any]:
    overview, quota = await asyncio.gather(
        build_overview(),
        _fetch_quota_for_dashboard(),
    )
    usage_records, usage_total = db.list_all_usage_records(offset=0, limit=10)
    model_tokens = db.opencode_model_token_stats(period=period)
    return {
        "overview": overview,
        "quota": quota,
        "recent_usage": {
            "records": [r.to_dict() for r in usage_records],
            "total": usage_total,
        },
        "model_tokens": model_tokens,
        "period": period,
    }


async def _fetch_quota_for_dashboard() -> list[dict]:
    rows = db.list_opencode_accounts(enabled_only=True)
    if not rows:
        return []
    from .config import AccountConfig

    accounts = [
        AccountConfig(
            name=row.name,
            workspace_id=row.workspace_id,
            auth_cookie=row.auth_cookie,
            show_rolling=row.show_rolling,
            show_weekly=row.show_weekly,
            show_monthly=row.show_monthly,
        )
        for row in rows
    ]
    from .quota import fetch_all_quotas

    results = await fetch_all_quotas(accounts)
    id_by_name = {row.name: row.id for row in rows}
    for item in results:
        item["account_id"] = id_by_name.get(item.get("name", ""))
    return results


@app.get("/api/analytics/overview")
async def analytics_overview() -> dict[str, Any]:
    try:
        return await build_overview()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/analytics/opencode/daily")
async def analytics_opencode_daily(
    days: int = Query(30, ge=1, le=365),
    account_id: str | None = Query(None),
) -> dict[str, Any]:
    return {"days": days, "stats": db.opencode_daily_stats(days, account_id)}


@app.get("/api/analytics/opencode/daily/models")
async def analytics_opencode_daily_models(
    days: int = Query(30, ge=1, le=365),
    account_id: str | None = Query(None),
) -> dict[str, Any]:
    return {"days": days, "stats": db.opencode_daily_model_stats(days, account_id)}


@app.get("/api/analytics/opencode/model-tokens")
async def analytics_opencode_model_tokens(
    account_id: str | None = Query(None),
    days: int = Query(30, ge=1, le=365),
) -> dict[str, Any]:
    return {"days": days, "stats": db.opencode_model_token_stats(days, account_id)}


@app.get("/api/usage/all")
async def list_all_usage(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    account_id: str | None = None,
) -> dict[str, Any]:
    records, total = db.list_all_usage_records(offset=offset, limit=limit, account_id=account_id)
    accounts = db.list_opencode_accounts()
    return {
        "records": [r.to_dict() for r in records],
        "total": total,
        "offset": offset,
        "limit": limit,
        "accounts": [{"id": row.id, "name": row.name} for row in accounts],
    }


@app.get("/api/config")
async def config_status() -> dict:
    try:
        ensure_bootstrapped()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _build_config_response()


@app.put("/api/config")
async def update_config(body: ServiceConfigUpdate) -> dict:
    try:
        ensure_bootstrapped()
        updates: dict[str, Any] = {}
        if body.refresh is not None:
            updates["refresh"] = {
                key: value.model_dump(exclude_unset=True)
                for key, value in body.refresh.items()
            }
        if body.usage_sync is not None:
            updates["usage_sync"] = body.usage_sync.model_dump(exclude_unset=True)
        if body.opencode is not None:
            updates["opencode"] = body.opencode.model_dump(exclude_unset=True)
        update_service_config(updates)
        await restart_usage_sync_task()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _build_config_response()


if FRONTEND_DIST.is_dir():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        static_file = (FRONTEND_DIST / full_path).resolve()
        try:
            static_file.relative_to(FRONTEND_DIST.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404) from exc
        if static_file.is_file():
            return FileResponse(static_file)
        index = FRONTEND_DIST / "index.html"
        if not index.exists():
            raise HTTPException(status_code=404)
        return FileResponse(index)


def run() -> None:
    import uvicorn

    ensure_bootstrapped()
    cfg = load_service_config()
    uvicorn.run(
        "app.main:app",
        host=cfg.listen_host,
        port=cfg.listen_port,
        reload=False,
    )


if __name__ == "__main__":
    run()
