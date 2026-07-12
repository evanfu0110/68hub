import json

import pytest
from fastapi.testclient import TestClient

from app import db
from app.bootstrap import ensure_bootstrapped
from app.main import app


def test_update_config_persists_to_database(temp_data_dir):
    ensure_bootstrapped()
    client = TestClient(app)

    resp = client.put(
        "/api/config",
        json={
            "refresh": {
                "ollama": {"auto_refresh": False, "interval_sec": 120},
                "opencode_go": {"auto_refresh": True, "interval_sec": 90},
            },
            "usage_sync": {
                "auto_sync": False,
                "interval_sec": 600,
                "backfill_pages_per_request": 3,
                "max_pages_per_incremental": 8,
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["refresh"]["ollama"]["auto_refresh"] is False
    assert data["refresh"]["ollama"]["interval_sec"] == 120
    assert data["refresh"]["opencode_go"]["interval_sec"] == 90
    assert data["usage_sync"]["auto_sync"] is False
    assert data["usage_sync"]["backfill_pages_per_request"] == 3

    stored = db.get_service_settings_payload()
    assert stored["refresh"]["ollama"]["auto_refresh"] is False
    assert stored["usage_sync"]["max_pages_per_incremental"] == 8

    get_resp = client.get("/api/config")
    assert get_resp.json()["usage_sync"]["max_pages_per_incremental"] == 8


def test_migrate_settings_from_legacy_files(temp_data_dir, monkeypatch: pytest.MonkeyPatch):
    config = temp_data_dir / "config.json"
    monkeypatch.setenv("68BACKEND_CONFIG", str(config))
    config.write_text(
        json.dumps(
            {
                "refresh": {
                    "ollama": {"auto_refresh": False, "interval_sec": 111},
                },
                "usage_sync": {"interval_sec": 222},
            }
        ),
        encoding="utf-8",
    )
    service = temp_data_dir / "service.json"
    service.write_text(
        json.dumps(
            {
                "refresh": {
                    "opencode_go": {"interval_sec": 333},
                },
                "usage_sync": {"auto_sync": False},
            }
        ),
        encoding="utf-8",
    )

    ensure_bootstrapped()

    stored = db.get_service_settings_payload()
    assert stored["refresh"]["ollama"]["auto_refresh"] is False
    assert stored["refresh"]["ollama"]["interval_sec"] == 111
    assert stored["refresh"]["opencode_go"]["interval_sec"] == 333
    assert stored["usage_sync"]["interval_sec"] == 222
    assert stored["usage_sync"]["auto_sync"] is False

    client = TestClient(app)
    resp = client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["refresh"]["ollama"]["interval_sec"] == 111
