from datetime import UTC, datetime

from app.opencode_usage import parse_usage_response
from app.quota import build_cookie_header, parse_quota_html


SAMPLE_USAGE_RESPONSE = """
$R[26]={id:"usg_01KX2Z5HDXVJ9MGSBPF2WYQZCQ",workspaceID:"wrk_01KVZAXQQS6ZJ6D5W2195DY9W8",
timeCreated:$R[27]=new Date("2026-07-09T08:16:06.000Z"),timeUpdated:$R[28]=new Date("2026-07-09T08:16:06.086Z"),
timeDeleted:null,model:"glm-5.2",provider:"deepinfra-glm-5.2",inputTokens:78675,outputTokens:177,
cost:11092380,keyID:"key_01KVZDHTH6F9NCZW5AMFB7RMCJ",sessionID:"",enrichment:$R[29]={plan:"lite"}}
"""


def test_build_cookie_header_raw_value():
    assert build_cookie_header("abc123") == "auth=abc123"


def test_build_cookie_header_full_cookie():
    assert build_cookie_header("auth=token123; other=x") == "auth=token123"


def test_parse_quota_html():
    html = """
    rollingUsage: $R[0] = { usagePercent: 12.5, resetInSec: 3600 }
    weeklyUsage: $R[0] = { usagePercent: 40, resetInSec: 86400 }
    monthlyUsage: $R[0] = { usagePercent: 75.2, resetInSec: 1209600 }
    """
    now = datetime(2026, 6, 25, 12, 0, 0, tzinfo=UTC)
    windows = parse_quota_html(html, now)
    assert len(windows) == 3
    assert windows[0].label == "5h Rolling"
    assert windows[0].used == 12.5
    assert windows[1].used == 40
    assert windows[2].used == 75.2


def test_parse_usage_response():
    records = parse_usage_response(SAMPLE_USAGE_RESPONSE)
    assert len(records) == 1
    record = records[0]
    assert record.usg_id == "usg_01KX2Z5HDXVJ9MGSBPF2WYQZCQ"
    assert record.model == "glm-5.2"
    assert record.input_tokens == 78675
    assert record.output_tokens == 177
    assert record.cost_raw == 11092380
    assert abs(record.cost_usd - 0.01109238) < 1e-9
    assert record.key_id == "key_01KVZDHTH6F9NCZW5AMFB7RMCJ"
    assert record.plan == "lite"
