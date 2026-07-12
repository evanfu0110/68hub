# cola — OpenCode Go 后端交接包

本文件夹从 QuotaHub 项目抽取,包含**获取 OpenCode Go 账户余额与各模型 Token 用量**的完整后端(FastAPI + SQLite + httpx)。下一个 AI 可基于此为 Electron 桌面应用写前端。

---

## 1. 一句话定位

- **余额**:抓取 `https://opencode.ai/workspace/<wrk_id>/go` 的 Dashboard HTML,正则解析 5h Rolling / Weekly / Monthly 三个窗口的**使用百分比 + 重置时间**(Dashboard 只给百分比,无 token 绝对值)。
- **Token 统计**:调用 `https://opencode.ai/_server?id=<usage_server_id>` 的 server-fn 接口分页拉取每条使用记录(含 model / inputTokens / outputTokens / cost / keyID / plan),写入本地 SQLite `usage_records` 表,然后按 model 聚合即可得到"各模型 Token 统计"。

两套数据源都用同一个 `auth=` cookie 鉴权。

---

## 2. 文件清单与职责

```
cola/backend/
├── pyproject.toml                 # 依赖:fastapi, httpx, uvicorn;dev:pytest,pytest-asyncio
├── uv.lock
├── app/
│   ├── main.py                    # FastAPI 路由(REST 端点,见 §5)
│   ├── quota.py                   # ★ 余额:Dashboard HTML 抓取与解析
│   ├── opencode_usage.py          # ★ Token 用量:_server 接口分页拉取与解析
│   ├── usage_sync.py              # ★ 增量同步 / 回填,落库 usage_records
│   ├── db.py                      # ★ SQLite schema + 全部查询(含 usage_records)
│   ├── config.py                  # 配置(data_dir / cookie 脱敏 / service_settings)
│   ├── bootstrap.py               # 启动初始化:建表 + 旧 config.json 一次性导入
│   ├── schemas.py                 # Pydantic 请求模型
│   ├── analytics.py               # 聚合(级联阻塞、eff 今天剩余等,主要为 Overview)
│   ├── ollama_quota.py            # Ollama 相关(Electron 若只做 OpenCode Go 可忽略)
│   └── __init__.py
└── tests/                         # ★ 不打网络;fixture 见 conftest.py
    ├── conftest.py                # temp_data_dir fixture:用 monkeypatch 设 QUOTAHUB_DATA
    ├── test_quota.py              # HTML 解析单测(用本地字符串,无网)
    ├── test_usage_sync.py
    ├── test_db.py
    ├── test_api_quota.py
    ├── test_api_config.py
    ├── test_analytics.py
    └── test_ollama_quota.py
```

标 ★ 的文件是做 OpenCode Go 桌面应用最核心的。

---

## 3. 鉴权与工作区解析(关键!)

### 3.1 auth cookie
- 用户从浏览器开发者工具复制 OpenCode Go 登录后的 cookie,形如 `auth=xxxxxxxx` 或整段 `Cookie:` 头。
- `quota.py:build_cookie_header()` 统一处理:剥离 `cookie:` 前缀,取 `auth=xxx` 那一段。**存库时存原始值,返回给前端时必须用 `config.mask_cookie()` 脱敏**(见 §7 安全约定)。
- cookie 失效会收到 HTTP 401/403,代码抛 `认证失败 (HTTP 401/403),请检查 auth cookie`。

### 3.2 workspace_id
- 用户可填 `"Default"` 或 `wrk_xxxx`。`quota.py:resolve_workspace_id()` 会在没有 `wrk_` 前缀时:
  1. 调 `https://opencode.ai/_server?id=<WORKSPACE_SERVER_ID>`(固定值见 `quota.py:14`)列出账号所有 workspace;
  2. 按名字或 hint 匹配;匹配不到取第一个。
- 解析后的 `wrk_xxxx` 会回写到 `opencode_accounts.resolved_workspace_id`,后续请求直接复用。
- **Electron 端**:在"添加账号"表单里让用户填名字 + cookie 即可,workspace_id 默认 `Default`,后端会自动解析。

### 3.3 usage_server_id
- 拉取**使用记录**(区别于 workspace 列表)用的是另一个 server-fn id,默认 `DEFAULT_USAGE_SERVER_ID`(`config.py:9`)。该值存于 `service_settings.opencode.usage_server_id`,一般不用改;若 OpenCode 改了接口需要更新此值。

---

## 4. SQLite Schema(摘自 db.py:init_db)

无迁移框架,启动时 `CREATE TABLE IF NOT EXISTS`。Electron 端**不需要自己建表**,后端启动自动建。

核心表(只列 OpenCode Go 相关):

```sql
-- 账号
CREATE TABLE opencode_accounts (
  id TEXT PRIMARY KEY,              -- uuid
  name TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'Default',  -- 用户原始填值
  resolved_workspace_id TEXT,                    -- 解析后的 wrk_xxxx
  auth_cookie TEXT NOT NULL,         -- ★ 原始 cookie,返回前端必须脱敏
  show_rolling/weekly/monthly INTEGER NOT NULL DEFAULT 1,  -- 0/1 bool
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT, updated_at TEXT
);

-- 每条使用记录(★ Token 统计数据源)
CREATE TABLE usage_records (
  usg_id TEXT PRIMARY KEY,          -- 去重主键,INSERT OR IGNORE
  account_id TEXT NOT NULL REFERENCES opencode_accounts(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,         -- ISO8601,带 Z
  model TEXT NOT NULL,             -- ★ 按这个聚合
  provider TEXT,
  input_tokens INTEGER NOT NULL,    -- ★
  output_tokens INTEGER NOT NULL,   -- ★
  cost_raw INTEGER NOT NULL,        -- 原始整数
  cost_usd REAL NOT NULL,           -- cost_raw / 1_000_000_000
  key_id TEXT,
  plan TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX idx_usage_account_time ON usage_records(account_id, created_at DESC);
CREATE INDEX idx_usage_account_key  ON usage_records(account_id, key_id, created_at DESC);

-- 同步状态(每账号一行)
CREATE TABLE usage_sync_state (
  account_id TEXT PRIMARY KEY REFERENCES opencode_accounts(id) ON DELETE CASCADE,
  last_sync_at TEXT, last_sync_status TEXT, last_sync_error TEXT,
  last_inserted_count INTEGER DEFAULT 0,
  deepest_page_fetched INTEGER DEFAULT -1,  -- 回填续页用
  total_records INTEGER DEFAULT 0,
  oldest_record_at TEXT, newest_record_at TEXT
);

-- 服务设置(refresh/usage_sync/opencode,JSON 存一行)
CREATE TABLE service_settings (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT, updated_at TEXT);
```

**约定**:布尔存 0/1 int;行↔dataclass 转换在 `db.py`;时间用 `_now_iso()`(`datetime.now(UTC).isoformat().replace("+00:00","Z")`)。

---

## 5. REST 端点(OpenCode Go 相关)

完整列表见 QuotaHub `README.md`。Electron 端主要用这些:

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 探活 |
| GET | `/api/quota` | 所有启用账号实时余额(抓 Dashboard) |
| GET | `/api/accounts/opencode` | 账号列表(cookie 脱敏) |
| POST | `/api/accounts/opencode` | 新增账号 |
| GET/PUT/DELETE | `/api/accounts/opencode/{id}` | 查/改/删 |
| POST | `/api/accounts/opencode/{id}/test` | 测试 cookie + 解析 workspace_id |
| GET | `/api/accounts/opencode/{id}/quota` | 单账号实时余额 |
| GET | `/api/accounts/opencode/{id}/usage` | 本地使用记录(分页,可按 key_id 过滤) |
| POST | `/api/accounts/opencode/{id}/usage/sync` | 增量同步(拉新数据入库) |
| POST | `/api/accounts/opencode/{id}/usage/backfill?pages=N` | 回填历史(从 deepest_page+1 往后翻) |
| GET | `/api/usage/all?account_id=&offset=&limit=` | 跨账号使用记录 |
| GET | `/api/analytics/opencode/daily?days=N` | 按日 cost/请求数 |
| GET | `/api/analytics/opencode/daily/models?days=N` | 按日×模型 cost/请求数 |
| GET/PUT | `/api/config` | 读/改服务设置 |

### ⚠️ 尚不存在的端点(需要新增)
**按模型汇总 Token** 的端点目前**没有**。已有 `opencode_daily_model_stats`(`db.py:623`)是**按日×模型**的 cost/request_count,没按 model 汇总 token 总数。做"各模型 Token 统计"需要新增:

```python
# 在 db.py 加:
def opencode_model_token_stats(account_id: str | None = None, days: int = 30) -> list[dict]:
    where = "WHERE substr(created_at,1,10) >= date('now', ?)"
    params: list[Any] = [f"-{days} days"]
    if account_id:
        where += " AND account_id = ?"
        params.append(account_id)
    rows = conn.execute(f"""
        SELECT model,
               COUNT(*) AS requests,
               SUM(input_tokens) AS input_tokens,
               SUM(output_tokens) AS output_tokens,
               SUM(cost_usd) AS cost_usd
        FROM usage_records {where}
        GROUP BY model ORDER BY (SUM(input_tokens)+SUM(output_tokens)) DESC
    """, params).fetchall()
    # ... 返回 list[dict]
```

```python
# 在 main.py 加:
@app.get("/api/analytics/opencode/model-tokens")
async def model_tokens(account_id: str | None = None, days: int = Query(30, ge=1, le=365)):
    return {"days": days, "stats": db.opencode_model_token_stats(account_id, days)}
```

---

## 6. 运行后端

**前置**:Python ≥ 3.11,安装 [uv](https://docs.astral.sh/uv/)。

```bash
cd cola/backend
uv sync --all-groups --frozen      # 装 deps + dev(pytest)
uv run uvicorn app.main:app --host 127.0.0.1 --port 8788   # 起服务
```

环境变量:
- `68BACKEND_DATA` — 数据目录(放 `68backend.db`),源码运行默认 `./data`。
- `68BACKEND_LISTEN_HOST` / `68BACKEND_LISTEN_PORT` — 绑定,默认 `127.0.0.1:8788`。

测试(不打网络):
```bash
uv run python -m pytest -q
uv run python -m pytest tests/test_quota.py -q
uv run python -m pytest tests/test_quota.py::test_name
```
`pytest-asyncio` 为 `auto` 模式(`pyproject.toml`),async 测试**无需** `@pytest.mark.asyncio`。

---

## 7. 安全与约定(下一个 AI 必读)

- **绝不**在新增端点返回原始 `auth_cookie` / `session_cookie`。用 `config.mask_cookie()` / `mask_ollama_cookie()` 脱敏;`main.py` 的 `_opencode_account_dict` / `_ollama_account_dict` 是模板。
- `config.json`、`docker-compose.yml` 是 gitignored(含用户 secrets)。模板用 `.example` 变体。
- **无迁移框架**:改 schema 直接在 `db.py:init_db()` 加 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE`(注意老库兼容)。无 Alembic。
- 后端用 stdlib `dataclasses` + 原生 `sqlite3`,**无 ORM**。
- 时间统一 UTC ISO8601 带 `Z`。
- `_server` 接口返回的是 React Server Components 风格的序列化文本(`$R[n]` 引用),用正则解析(见 `opencode_usage.py:RECORD_RE` / `PLAN_RE`),不是 JSON。OpenCode 改前端结构时正则会失效,需要更新正则。

---

## 8. 数据流(给 Electron 端的 mental model)

```
用户填 cookie + name
   │ POST /api/accounts/opencode
   ▼
opencode_accounts(存 cookie + workspace_id="Default")
   │ POST /api/accounts/opencode/{id}/test  → 解析 resolved_workspace_id
   ▼
┌─────────────────────────────────────────────────┐
│  余额分支                                         │
│  GET /api/quota 或 /api/accounts/{id}/quota      │
│   → quota.fetch_quota_for_account                │
│   → GET https://opencode.ai/workspace/<wrk>/go    │
│   → parse_quota_html (正则)                      │
│   → 3 个 QuotaWindow{used%, remaining%, reset}   │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  Token 统计分支                                  │
│  POST /usage/sync (增量) 或 /usage/backfill      │
│   → usage_sync → opencode_usage.fetch_usage_page │
│   → GET https://opencode.ai/_server?id=<usage_id>│
│   → parse_usage_response (正则)                  │
│   → INSERT OR IGNORE usage_records               │
│  然后按 model GROUP BY 聚合(见 §5 新端点)       │
└─────────────────────────────────────────────────┘
```

**同步策略**:`sync` 从第 0 页往后翻,一旦某页新 inserted=0 或不足 pageSize 就停(`max_pages_per_incremental` 默认 10);`backfill` 从 `deepest_page_fetched+1` 续翻(`backfill_pages_per_request` 默认 5)。`usg_id` 主键去重,重复拉取安全。

---

## 9. Electron 对接建议

1. **后端作为 sidecar**:Electron 主进程用 `child_process.spawn` 启动 `uv run uvicorn app.main:app --port 8788`(或打包后直接跑 `quota-hub` console script),渲染进程通过 `fetch('http://127.0.0.1:8788/api/...')` 调用。
   - 数据目录建议设成 `app.getPath('userData')`:`spawn('uv', [...], { env: { ...process.env, QUOTAHUB_DATA: userDataPath } })`。
   - 退出时杀子进程,避免端口占用。
2. **或打包成单文件**:用 `uv` 的 `--no-dev` 安装只装运行依赖,把 `cola/backend` 当资源一起 electron-builder 打进去,启动时 spawn。
3. **首次使用**:用户添加第一个账号 → 自动 `init_db` → 显示余额;Token 统计需先触发一次 `sync` 或 `backfill` 拉到数据后才显示(空库时聚合为空数组,UI 友好提示"先点同步")。
4. **轮询**:余额自动刷新间隔存于 `service_settings.refresh.opencode_go.interval_sec`(默认 60s,最小 15)。Electron 端可起定时器轮询 `/api/quota`,或调 `PUT /api/config` 改间隔。后台同步任务 `_usage_auto_sync_loop`(`main.py:48`)会在 `usage_sync.auto_sync=true` 时自动跑增量。
5. **跨域**:后端 `main.py` 已 `CORSMiddleware(allow_origins=["*"])`,Electron 渲染进程直接 fetch 不受 CORS 限制。

---

## 10. 已知限制 / 改进方向

- 余额只有百分比,无绝对 token/美元剩余(Dashboard 不暴露)。
- `_server` 返回是序列化 JS,正则解析脆弱;OpenCode 改前端会断。
- 模型 Token 聚合端点未实现(见 §5 切片),是做"各模型 token 统计"唯一缺的拼图。
- 旧 `config.json` 导入只在首次(`data/.imported` flag),之后全靠 SQLite + UI。
- Ollama 相关文件(`ollama_quota.py`、部分 `analytics.py`、`main.py` 的 ollama 路由)如果桌面应用只做 OpenCode Go,可删除;但 `main.py` / `analytics.py` 有 import 依赖,删要顺手清理。

---

## 11. 验证后端能跑

```bash
cd cola/backend
uv sync --all-groups --frozen
uv run python -m pytest -q                    # 全绿说明解析/同步逻辑没问题
uv run uvicorn app.main:app --port 8788       # 浏览器开 http://127.0.0.1:8788/api/health
```