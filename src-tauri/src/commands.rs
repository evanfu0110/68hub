use std::sync::Arc;

use futures::future::join_all;
use tauri::{AppHandle, State};

use crate::{
    database::Database,
    error::{AppError, AppResult},
    models::{
        Account, AccountInput, AccountTestResult, AccountUpdate, DailyModelStat, DailyStat,
        Dashboard, ModelTokenStat, Overview, RecentUsage, Settings, SettingsUpdate, StatsQuery,
        SyncProgress, SyncResult, UsagePage, UsageQuery,
    },
    opencode, secrets,
    sync::SyncManager,
};

pub struct AppState {
    pub database: Arc<Database>,
    pub sync: Arc<SyncManager>,
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    Ok(state
        .database
        .list_accounts(false)?
        .into_iter()
        .map(|stored| stored.account)
        .collect())
}

#[tauri::command]
pub fn create_account(
    app: AppHandle,
    state: State<'_, AppState>,
    input: AccountInput,
) -> AppResult<Account> {
    if input.auth_cookie.trim().is_empty() {
        return Err(AppError::Validation("auth cookie is required".into()));
    }
    let secret_id = secrets::new_secret_id();
    secrets::set(&app, &secret_id, &input.auth_cookie)?;
    match state.database.create_account(&input, &secret_id) {
        Ok(account) => Ok(account),
        Err(error) => {
            let _ = secrets::remove(&app, &secret_id);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn update_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: AccountUpdate,
) -> AppResult<Account> {
    let account = state.database.get_account(&id)?;
    if let Some(cookie) = input.auth_cookie.as_deref() {
        secrets::set(&app, &account.secret_id, cookie)?;
    }
    state.database.update_account(&id, &input)
}

#[tauri::command]
pub fn delete_account(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let secret_id = state.database.get_account(&id)?.secret_id;
    secrets::remove(&app, &secret_id)?;
    state.database.delete_account(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn test_account(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<AccountTestResult> {
    let account = state.database.get_account(&id)?;
    let cookie = secrets::get(&app, &account.secret_id)?;
    match opencode::resolve_workspace_id(&account.account.workspace_id, &cookie).await {
        Ok(workspace_id) => {
            state.database.set_resolved_workspace(&id, &workspace_id)?;
            Ok(AccountTestResult {
                success: true,
                workspace_id: Some(workspace_id),
                error: None,
            })
        }
        Err(error) => Ok(AccountTestResult {
            success: false,
            workspace_id: None,
            error: Some(error.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn get_dashboard(
    app: AppHandle,
    state: State<'_, AppState>,
    period: String,
) -> AppResult<Dashboard> {
    if !matches!(period.as_str(), "5h" | "7d" | "30d") {
        return Err(AppError::Validation("invalid dashboard period".into()));
    }
    let accounts = state.database.list_accounts(true)?;
    let tasks = accounts.iter().map(|account| {
        let cookie = secrets::get(&app, &account.secret_id);
        async move {
            match cookie {
                Ok(cookie) => opencode::fetch_quota(account, &cookie).await,
                Err(error) => crate::models::QuotaAccount {
                    account_id: account.account.id.clone(),
                    name: account.account.name.clone(),
                    success: false,
                    workspace_id: account.account.workspace_id.clone(),
                    windows: Vec::new(),
                    error: Some(error.to_string()),
                },
            }
        }
    });
    let quota = join_all(tasks).await;
    let overview = Overview {
        opencode: opencode::aggregate_overview(&quota),
    };
    let (records, total) = state.database.recent_usage(10)?;
    let model_tokens = state.database.model_stats(&period, None)?;
    Ok(Dashboard {
        overview,
        quota,
        recent_usage: RecentUsage { records, total },
        model_tokens,
        period,
    })
}

#[tauri::command]
pub async fn sync_usage(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<SyncResult> {
    let account = state.database.get_account(&id)?;
    let cookie = secrets::get(&app, &account.secret_id)?;
    let result = state.sync.sync(&state.database, &account, &cookie).await;
    if let Err(error) = &result {
        let _ = state.database.update_sync_error(&id, &error.to_string());
    }
    result
}

#[tauri::command]
pub fn get_sync_progress(state: State<'_, AppState>, id: String) -> SyncProgress {
    state.sync.progress(&id)
}

#[tauri::command]
pub fn get_usage(state: State<'_, AppState>, query: UsageQuery) -> AppResult<UsagePage> {
    state.database.usage_page(&query)
}

#[tauri::command]
pub fn get_daily_stats(state: State<'_, AppState>, query: StatsQuery) -> AppResult<Vec<DailyStat>> {
    state
        .database
        .daily_stats(query.days, query.account_id.as_deref())
}

#[tauri::command]
pub fn get_daily_model_stats(
    state: State<'_, AppState>,
    query: StatsQuery,
) -> AppResult<Vec<DailyModelStat>> {
    state
        .database
        .daily_model_stats(query.days, query.account_id.as_deref())
}

#[tauri::command]
pub fn get_model_stats(
    state: State<'_, AppState>,
    query: StatsQuery,
) -> AppResult<Vec<ModelTokenStat>> {
    state
        .database
        .model_stats(&query.days.to_string(), query.account_id.as_deref())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    state.database.get_settings()
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, input: SettingsUpdate) -> AppResult<Settings> {
    state.database.update_settings(&input)
}
