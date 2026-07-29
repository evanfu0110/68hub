use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub workspace_id: String,
    pub resolved_workspace_id: Option<String>,
    pub auth_cookie_masked: String,
    pub configured: bool,
    pub show_rolling: bool,
    pub show_weekly: bool,
    pub show_monthly: bool,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct AccountInput {
    pub name: String,
    #[serde(default = "default_workspace")]
    pub workspace_id: String,
    pub auth_cookie: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/", optional_fields)]
pub struct AccountUpdate {
    pub name: Option<String>,
    pub workspace_id: Option<String>,
    pub auth_cookie: Option<String>,
    pub show_rolling: Option<bool>,
    pub show_weekly: Option<bool>,
    pub show_monthly: Option<bool>,
    pub enabled: Option<bool>,
}

fn default_workspace() -> String {
    "Default".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct QuotaWindow {
    pub label: String,
    pub used: f64,
    pub remaining: f64,
    pub total: f64,
    pub reset_at: String,
    #[ts(type = "number")]
    pub reset_in_sec: i64,
    pub blocked: bool,
    pub blocked_by: Option<String>,
    pub effective_remaining: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct QuotaAccount {
    pub account_id: String,
    pub name: String,
    pub success: bool,
    pub workspace_id: String,
    pub windows: Vec<QuotaWindow>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct OverviewAccount {
    pub account_id: String,
    pub name: String,
    pub success: bool,
    pub effective_remaining: f64,
    pub blocked: bool,
    pub windows: Vec<QuotaWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct OpenCodeOverview {
    pub avg_effective_remaining: f64,
    pub account_count: usize,
    pub success_count: usize,
    pub blocked_count: usize,
    pub accounts: Vec<OverviewAccount>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct Overview {
    pub opencode: OpenCodeOverview,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct UsageRecord {
    pub usg_id: String,
    pub account_id: String,
    pub account_name: Option<String>,
    pub created_at: String,
    pub model: String,
    pub provider: Option<String>,
    #[ts(type = "number")]
    pub input_tokens: i64,
    #[ts(type = "number")]
    pub output_tokens: i64,
    pub cost_usd: f64,
    pub key_id: Option<String>,
    pub plan: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewUsageRecord {
    pub usg_id: String,
    pub created_at: String,
    pub model: String,
    pub provider: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost_raw: i64,
    pub cost_usd: f64,
    pub key_id: Option<String>,
    pub plan: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct UsageQuery {
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub limit: usize,
    pub account_id: Option<String>,
}

fn default_page_size() -> usize {
    50
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct SyncState {
    pub last_sync_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_error: Option<String>,
    #[ts(type = "number")]
    pub total_records: i64,
    pub oldest_record_at: Option<String>,
    pub newest_record_at: Option<String>,
    #[ts(type = "number")]
    pub deepest_page_fetched: i64,
    pub history_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct UsagePage {
    pub records: Vec<UsageRecord>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub accounts: Vec<AccountOption>,
    pub sync: Option<SyncState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct AccountOption {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct DailyStat {
    pub date: String,
    pub total_cost_usd: f64,
    #[ts(type = "number")]
    pub request_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct DailyModelStat {
    pub date: String,
    pub model: String,
    pub total_cost_usd: f64,
    #[ts(type = "number")]
    pub request_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct ModelTokenStat {
    pub model: String,
    #[ts(type = "number")]
    pub request_count: i64,
    #[ts(type = "number")]
    pub total_input_tokens: i64,
    #[ts(type = "number")]
    pub total_output_tokens: i64,
    pub total_cost_usd: f64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct StatsQuery {
    #[serde(default = "default_days")]
    pub days: u16,
    pub account_id: Option<String>,
}

fn default_days() -> u16 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct Dashboard {
    pub overview: Overview,
    pub quota: Vec<QuotaAccount>,
    pub recent_usage: RecentUsage,
    pub model_tokens: Vec<ModelTokenStat>,
    pub period: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct RecentUsage {
    pub records: Vec<UsageRecord>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct SyncResult {
    pub inserted: usize,
    pub pages_fetched: usize,
    pub sync_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct SyncProgress {
    pub status: String,
    pub current: usize,
    pub total: usize,
    pub inserted: usize,
    pub error: Option<String>,
}

impl Default for SyncProgress {
    fn default() -> Self {
        Self {
            status: "idle".into(),
            current: 0,
            total: 0,
            inserted: 0,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct Settings {
    pub theme: String,
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            language: "system".into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/", optional_fields)]
pub struct SettingsUpdate {
    pub theme: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/api/generated/")]
pub struct AccountTestResult {
    pub success: bool,
    pub workspace_id: Option<String>,
    pub error: Option<String>,
}
