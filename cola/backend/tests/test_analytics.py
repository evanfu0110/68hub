from app.analytics import (
    LABEL_SESSION,
    aggregate_ollama,
    aggregate_opencode,
    apply_opencode_cascade,
    ollama_account_pro_stats,
    plan_multiplier,
)
from app.quota import LABEL_MONTHLY, LABEL_ROLLING, LABEL_WEEKLY


def test_plan_multiplier():
    assert plan_multiplier("Pro") == 1
    assert plan_multiplier("max") == 5
    assert plan_multiplier("Max") == 5


def test_ollama_account_pro_stats():
    stats = ollama_account_pro_stats(
        {
            "name": "A",
            "plan": "Max",
            "success": True,
            "windows": [{"label": LABEL_SESSION, "remaining": 80.0}],
        }
    )
    assert stats["multiplier"] == 5
    assert stats["remaining_pro"] == 4.0
    assert stats["capacity_pro"] == 5


def test_apply_opencode_cascade_monthly_blocks_shorter():
    windows = [
        {"label": LABEL_MONTHLY, "used": 100.0, "remaining": 0.0},
        {"label": LABEL_WEEKLY, "used": 50.0, "remaining": 50.0},
        {"label": LABEL_ROLLING, "used": 10.0, "remaining": 90.0},
    ]
    cascaded = apply_opencode_cascade(windows)
    by_label = {w["label"]: w for w in cascaded}
    assert by_label[LABEL_WEEKLY]["blocked"] is True
    assert by_label[LABEL_ROLLING]["blocked"] is True
    assert by_label[LABEL_ROLLING]["effective_remaining"] == 0.0


def test_apply_opencode_cascade_weekly_blocks_rolling():
    windows = [
        {"label": LABEL_MONTHLY, "used": 50.0, "remaining": 50.0},
        {"label": LABEL_WEEKLY, "used": 100.0, "remaining": 0.0},
        {"label": LABEL_ROLLING, "used": 10.0, "remaining": 90.0},
    ]
    cascaded = apply_opencode_cascade(windows)
    by_label = {w["label"]: w for w in cascaded}
    assert by_label[LABEL_WEEKLY]["blocked"] is False
    assert by_label[LABEL_ROLLING]["blocked"] is True


def test_aggregate_opencode_avg():
    summary = aggregate_opencode(
        [
            {
                "name": "A",
                "success": True,
                "windows": [
                    {"label": LABEL_ROLLING, "used": 10.0, "remaining": 90.0},
                ],
            },
            {
                "name": "B",
                "success": True,
                "windows": [
                    {"label": LABEL_ROLLING, "used": 30.0, "remaining": 70.0},
                ],
            },
        ]
    )
    assert summary["avg_effective_remaining"] == 80.0
    assert summary["success_count"] == 2


def test_aggregate_ollama():
    summary = aggregate_ollama(
        [
            {
                "name": "P",
                "plan": "Pro",
                "success": True,
                "windows": [{"label": LABEL_SESSION, "remaining": 50.0}],
            },
            {
                "name": "M",
                "plan": "Max",
                "success": True,
                "windows": [{"label": LABEL_SESSION, "remaining": 100.0}],
            },
        ]
    )
    assert summary["total_remaining_pro"] == 5.5
    assert summary["total_capacity_pro"] == 6.0


def test_aggregate_ollama_models_session_and_weekly():
    from app.analytics import aggregate_ollama_models

    models = aggregate_ollama_models(
        [
            {
                "success": True,
                "windows": [
                    {
                        "label": LABEL_SESSION,
                        "models": [{"model": "glm-5.2", "requests": 10}],
                    },
                    {
                        "label": "Weekly",
                        "models": [{"model": "glm-5.2", "requests": 5}, {"model": "gpt", "requests": 3}],
                    },
                ],
            }
        ]
    )
    by_model = {m["model"]: m["requests"] for m in models}
    assert by_model["glm-5.2"] == 15
    assert by_model["gpt"] == 3
