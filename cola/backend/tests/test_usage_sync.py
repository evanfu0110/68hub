from unittest.mock import AsyncMock, patch

import pytest

from app import db
from app.usage_sync import sync_usage_incremental
from app.opencode_usage import ParsedUsageRecord


def _record(usg_id: str) -> ParsedUsageRecord:
    return ParsedUsageRecord(
        usg_id=usg_id,
        created_at="2026-07-09T08:16:06.000Z",
        model="glm-5.2",
        provider="p",
        input_tokens=1,
        output_tokens=1,
        cost_raw=1000,
        cost_usd=1e-6,
        key_id="key_x",
    )


@pytest.fixture()
def account(temp_data_dir):
    return db.create_opencode_account(
        name="sync-test",
        workspace_id="Default",
        auth_cookie="auth=t",
    )


@pytest.mark.asyncio
async def test_incremental_stops_on_duplicate_page(account, monkeypatch):
    page_data = {
        0: [_record("usg_new1"), _record("usg_new2")],
        1: [],
    }

    async def fake_fetch(**kwargs):
        page = kwargs.get("page", 0)
        return page_data.get(page, [])

    monkeypatch.setattr(
        "app.usage_sync.fetch_usage_page",
        AsyncMock(side_effect=fake_fetch),
    )
    monkeypatch.setattr(
        "app.usage_sync.resolve_account_workspace_id",
        AsyncMock(return_value="wrk_test"),
    )

    result = await sync_usage_incremental(account)
    assert result.inserted == 2
    assert result.pages_fetched == 1

    page_data[0] = [_record("usg_new1"), _record("usg_new2")]
    result2 = await sync_usage_incremental(account)
    assert result2.inserted == 0
    assert result2.pages_fetched == 1
