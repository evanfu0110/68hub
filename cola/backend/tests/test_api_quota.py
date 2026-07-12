from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.quota import LABEL_MONTHLY, LABEL_ROLLING, LABEL_WEEKLY, QuotaAccount, QuotaWindow


def test_opencode_account_quota_returns_dict(temp_data_dir):
    client = TestClient(app)
    row = db.create_opencode_account(
        name="Test",
        workspace_id="Default",
        auth_cookie="auth=testcookie",
    )
    mock_quota = QuotaAccount(
        index=0,
        name="Test",
        workspace_id="wrk_test",
        success=True,
        updated_at="2026-01-01T00:00:00Z",
        windows=[
            QuotaWindow(
                label=LABEL_ROLLING,
                used=10.0,
                remaining=90.0,
                total=100.0,
                unit="%",
                reset_at="2026-01-01T05:00:00Z",
                reset_in_sec=3600,
            ),
            QuotaWindow(
                label=LABEL_WEEKLY,
                used=20.0,
                remaining=80.0,
                total=100.0,
                unit="%",
                reset_at="2026-01-08T00:00:00Z",
                reset_in_sec=86400,
            ),
            QuotaWindow(
                label=LABEL_MONTHLY,
                used=30.0,
                remaining=70.0,
                total=100.0,
                unit="%",
                reset_at="2026-02-01T00:00:00Z",
                reset_in_sec=2592000,
            ),
        ],
    )
    with patch("app.main.fetch_quota_for_account", new_callable=AsyncMock, return_value=mock_quota):
        resp = client.get(f"/api/accounts/opencode/{row.id}/quota")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    assert data["success"] is True
    assert data["name"] == "Test"
    assert len(data["windows"]) == 3
    assert data["windows"][0]["label"] == LABEL_ROLLING
