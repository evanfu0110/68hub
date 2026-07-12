import pytest

from app import db
from app.bootstrap import ensure_bootstrapped


def test_create_and_list_opencode_account(temp_data_dir):
    row = db.create_opencode_account(
        name="test",
        workspace_id="Default",
        auth_cookie="auth=token",
    )
    accounts = db.list_opencode_accounts()
    assert len(accounts) == 1
    assert accounts[0].id == row.id
    assert accounts[0].name == "test"


def test_insert_usage_records_ignore(temp_data_dir):
    account = db.create_opencode_account(
        name="test",
        workspace_id="Default",
        auth_cookie="auth=token",
    )
    records = [
        {
            "usg_id": "usg_001",
            "created_at": "2026-07-09T08:16:06.000Z",
            "model": "glm-5.2",
            "provider": "deepinfra-glm-5.2",
            "input_tokens": 100,
            "output_tokens": 10,
            "cost_raw": 1000,
            "cost_usd": 0.000001,
            "key_id": "key_abc",
            "plan": "lite",
        }
    ]
    inserted = db.insert_usage_records_ignore(account.id, "wrk_test", records)
    assert inserted == 1
    inserted_again = db.insert_usage_records_ignore(account.id, "wrk_test", records)
    assert inserted_again == 0

    listed, total = db.list_usage_records(account.id)
    assert total == 1
    assert listed[0].usg_id == "usg_001"


def test_list_all_usage_records_and_daily_stats(temp_data_dir):
    account_a = db.create_opencode_account(
        name="Alpha",
        workspace_id="Default",
        auth_cookie="auth=a",
    )
    account_b = db.create_opencode_account(
        name="Beta",
        workspace_id="Default",
        auth_cookie="auth=b",
    )
    db.insert_usage_records_ignore(
        account_a.id,
        "wrk_a",
        [
            {
                "usg_id": "usg_a1",
                "created_at": "2026-07-09T10:00:00.000Z",
                "model": "glm-5.2",
                "provider": "p",
                "input_tokens": 1,
                "output_tokens": 1,
                "cost_raw": 1000,
                "cost_usd": 0.01,
                "key_id": "k1",
                "plan": "lite",
            }
        ],
    )
    db.insert_usage_records_ignore(
        account_b.id,
        "wrk_b",
        [
            {
                "usg_id": "usg_b1",
                "created_at": "2026-07-09T12:00:00.000Z",
                "model": "gpt",
                "provider": "p",
                "input_tokens": 2,
                "output_tokens": 2,
                "cost_raw": 2000,
                "cost_usd": 0.02,
                "key_id": "k2",
                "plan": "lite",
            }
        ],
    )

    records, total = db.list_all_usage_records(limit=10)
    assert total == 2
    assert {r.account_name for r in records} == {"Alpha", "Beta"}

    filtered, filtered_total = db.list_all_usage_records(account_id=account_a.id)
    assert filtered_total == 1
    assert filtered[0].account_name == "Alpha"

    stats = db.opencode_daily_stats(days=30)
    assert len(stats) >= 1
    assert stats[0]["request_count"] >= 1

    model_stats = db.opencode_daily_model_stats(days=30)
    assert len(model_stats) >= 1
    assert model_stats[0]["model"]


def test_import_from_config_once(temp_data_dir, monkeypatch: pytest.MonkeyPatch):
    config = temp_data_dir / "config.json"
    monkeypatch.setenv("68BACKEND_CONFIG", str(config))
    config.write_text(
        """
        {
          "listen_host": "127.0.0.1",
          "listen_port": 8788,
          "opencode_accounts": [
            {
              "name": "Imported",
              "workspace_id": "Default",
              "auth_cookie": "auth=imported"
            }
          ]
        }
        """,
        encoding="utf-8",
    )
    ensure_bootstrapped()
    assert db.count_opencode_accounts() == 1
    assert db.imported_flag_path().exists()

    config.write_text(
        '{"listen_host":"127.0.0.1","listen_port":8788,"opencode_accounts":[]}',
        encoding="utf-8",
    )
    ensure_bootstrapped()
    assert db.count_opencode_accounts() == 1
