use std::collections::{HashMap, HashSet};

use chrono::{Duration, Utc};
use regex::Regex;
use reqwest::{header, StatusCode};
use uuid::Uuid;

use crate::{
    database::StoredAccount,
    error::{AppError, AppResult},
    models::{NewUsageRecord, OpenCodeOverview, OverviewAccount, QuotaAccount, QuotaWindow},
    proxy,
};

const DASHBOARD_BASE: &str = "https://opencode.ai/workspace";
const WORKSPACE_SERVER_ID: &str =
    "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
const USAGE_SERVER_ID: &str = "bfd684bfc2e4eed05cd0b518f5e4eafd3f3376e3938abb9e536e7c03df831e5c";
pub const USAGE_PAGE_SIZE: usize = 50;
const MAX_RESPONSE_BYTES: usize = 4 << 20;

pub fn build_cookie_header(auth_cookie: &str) -> String {
    let mut cookie = auth_cookie.trim();
    if cookie.to_ascii_lowercase().starts_with("cookie:") {
        cookie = cookie[7..].trim();
    }
    if cookie.is_empty() {
        return String::new();
    }
    cookie
        .split(';')
        .map(str::trim)
        .find(|part| part.starts_with("auth="))
        .map(str::to_string)
        .unwrap_or_else(|| format!("auth={cookie}"))
}

pub async fn resolve_workspace_id(hint: &str, auth_cookie: &str) -> AppResult<String> {
    if let Some(id) = extract_workspace_id(hint) {
        return Ok(id);
    }
    let refs = fetch_workspace_refs(auth_cookie).await?;
    let hint = hint.trim();
    if !hint.is_empty() {
        if let Some((id, _)) = refs
            .iter()
            .find(|(id, name)| id.eq_ignore_ascii_case(hint) || name.eq_ignore_ascii_case(hint))
        {
            return Ok(id.clone());
        }
    }
    refs.first()
        .map(|(id, _)| id.clone())
        .ok_or_else(|| AppError::UpstreamFormat("workspace list was empty".into()))
}

fn extract_workspace_id(value: &str) -> Option<String> {
    Regex::new(r"wrk_[A-Za-z0-9]+")
        .expect("workspace regex")
        .find(value.trim())
        .map(|value| value.as_str().to_string())
}

async fn fetch_workspace_refs(auth_cookie: &str) -> AppResult<Vec<(String, String)>> {
    let cookie = build_cookie_header(auth_cookie);
    if cookie.is_empty() {
        return Err(AppError::Validation("auth cookie is required".into()));
    }
    let url = format!("https://opencode.ai/_server?id={WORKSPACE_SERVER_ID}");
    let response = proxy::client_for(&url)?
        .get(&url)
        .header(header::COOKIE, cookie)
        .header("X-Server-Id", WORKSPACE_SERVER_ID)
        .header("X-Server-Instance", format!("server-fn:{}", Uuid::new_v4()))
        .header(header::ORIGIN, "https://opencode.ai")
        .header(header::REFERER, "https://opencode.ai")
        .header(
            header::ACCEPT,
            "text/javascript, application/json;q=0.9, */*;q=0.8",
        )
        .send()
        .await?;
    ensure_success(response.status(), "workspace query")?;
    let text = response_text(response).await?;
    let regex = Regex::new(r#"(?s)id\s*:\s*"(wrk_[^"]+)"[^{}]*?name\s*:\s*"([^"]*)""#)
        .expect("workspace entry regex");
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for captures in regex.captures_iter(&text) {
        let id = captures[1].to_string();
        if seen.insert(id.clone()) {
            refs.push((id, captures[2].trim().to_string()));
        }
    }
    if refs.is_empty() {
        return Err(AppError::UpstreamFormat(
            "could not parse a workspace id".into(),
        ));
    }
    Ok(refs)
}

pub async fn fetch_quota(account: &StoredAccount, auth_cookie: &str) -> QuotaAccount {
    let workspace_hint = account.account.workspace_id.trim();
    let workspace_hint = if workspace_hint.is_empty() {
        "Default"
    } else {
        workspace_hint
    };
    match fetch_quota_inner(account, workspace_hint, auth_cookie).await {
        Ok(result) => result,
        Err(error) => QuotaAccount {
            account_id: account.account.id.clone(),
            name: account.account.name.clone(),
            success: false,
            workspace_id: workspace_hint.into(),
            windows: Vec::new(),
            error: Some(error.to_string()),
        },
    }
}

async fn fetch_quota_inner(
    account: &StoredAccount,
    workspace_hint: &str,
    auth_cookie: &str,
) -> AppResult<QuotaAccount> {
    let workspace_id = if let Some(id) = account.account.resolved_workspace_id.as_deref() {
        id.to_string()
    } else {
        resolve_workspace_id(workspace_hint, auth_cookie).await?
    };
    let url = format!("{DASHBOARD_BASE}/{workspace_id}/go");
    let response = proxy::client_for(&url)?
        .get(&url)
        .header(header::COOKIE, build_cookie_header(auth_cookie))
        .header(header::ACCEPT, "text/html, application/xhtml+xml")
        .send()
        .await?;
    ensure_success(response.status(), "dashboard")?;
    let html = response_text(response).await?;
    let mut windows = parse_quota_html(&html, Utc::now())?;
    windows.retain(|window| match window.label.as_str() {
        "5h Rolling" => account.account.show_rolling,
        "Weekly" => account.account.show_weekly,
        "Monthly" => account.account.show_monthly,
        _ => true,
    });
    apply_cascade(&mut windows);
    Ok(QuotaAccount {
        account_id: account.account.id.clone(),
        name: account.account.name.clone(),
        success: true,
        workspace_id,
        windows,
        error: None,
    })
}

pub fn parse_quota_html(html: &str, now: chrono::DateTime<Utc>) -> AppResult<Vec<QuotaWindow>> {
    let definitions = [
        ("5h Rolling", "rollingUsage"),
        ("Weekly", "weeklyUsage"),
        ("Monthly", "monthlyUsage"),
    ];
    let mut result = Vec::new();
    for (label, field) in definitions {
        let object = Regex::new(&format!(r"(?s){field}:\s*\$R\[\d+\]\s*=\s*\{{([^}}]*)\}}"))
            .expect("quota object regex")
            .captures(html)
            .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()));
        let Some(object) = object else { continue };
        let usage = extract_number(&object, "usagePercent");
        let reset = extract_number(&object, "resetInSec");
        if let (Some(usage), Some(reset)) = (usage, reset) {
            let used = usage.clamp(0.0, 100.0);
            let reset = reset.trunc() as i64;
            result.push(QuotaWindow {
                label: label.into(),
                used,
                remaining: 100.0 - used,
                total: 100.0,
                reset_at: (now + Duration::seconds(reset))
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                reset_in_sec: reset,
                blocked: false,
                blocked_by: None,
                effective_remaining: Some(100.0 - used),
            });
        }
    }
    if result.is_empty() {
        Err(AppError::UpstreamFormat(
            "could not parse quota windows".into(),
        ))
    } else {
        Ok(result)
    }
}

fn extract_number(fragment: &str, field: &str) -> Option<f64> {
    Regex::new(&format!(r#""?{field}"?\s*:\s*(-?\d+(?:\.\d+)?)"#))
        .ok()?
        .captures(fragment)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

fn apply_cascade(windows: &mut [QuotaWindow]) {
    let monthly_full = windows
        .iter()
        .any(|window| window.label == "Monthly" && window.used >= 100.0);
    let weekly_full = windows
        .iter()
        .any(|window| window.label == "Weekly" && window.used >= 100.0);
    for window in windows {
        let blocked_by = if window.label == "Weekly" && monthly_full {
            Some("Monthly")
        } else if window.label == "5h Rolling" && monthly_full {
            Some("Monthly")
        } else if window.label == "5h Rolling" && weekly_full {
            Some("Weekly")
        } else {
            None
        };
        window.blocked = blocked_by.is_some();
        window.blocked_by = blocked_by.map(str::to_string);
        window.effective_remaining = Some(if window.blocked {
            0.0
        } else {
            window.remaining
        });
    }
}

pub fn aggregate_overview(quota: &[QuotaAccount]) -> OpenCodeOverview {
    let mut accounts = Vec::with_capacity(quota.len());
    let mut effective_values = Vec::new();
    let mut blocked_count = 0;
    for item in quota {
        let effective = item
            .windows
            .iter()
            .find(|window| window.label == "5h Rolling")
            .or_else(|| item.windows.iter().find(|window| window.label == "Weekly"))
            .or_else(|| item.windows.iter().find(|window| window.label == "Monthly"))
            .and_then(|window| window.effective_remaining)
            .unwrap_or(0.0);
        let blocked = item.success && effective <= 0.0;
        if item.success {
            effective_values.push(effective);
        }
        if blocked {
            blocked_count += 1;
        }
        accounts.push(OverviewAccount {
            account_id: item.account_id.clone(),
            name: item.name.clone(),
            success: item.success,
            effective_remaining: round_one(effective),
            blocked,
            windows: item.windows.clone(),
        });
    }
    let average = if effective_values.is_empty() {
        0.0
    } else {
        round_one(effective_values.iter().sum::<f64>() / effective_values.len() as f64)
    };
    OpenCodeOverview {
        avg_effective_remaining: average,
        account_count: quota.len(),
        success_count: effective_values.len(),
        blocked_count,
        accounts,
    }
}

fn round_one(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

pub async fn fetch_usage_page(
    workspace_id: &str,
    auth_cookie: &str,
    page: usize,
) -> AppResult<Vec<NewUsageRecord>> {
    let mut args = vec![serde_json::Value::String(workspace_id.to_string())];
    if page > 0 {
        args.push(serde_json::Value::from(page));
    }
    let args = serde_json::to_string(&args).map_err(|e| AppError::UpstreamFormat(e.to_string()))?;
    let url = format!(
        "https://opencode.ai/_server?id={}&args={}",
        url::form_urlencoded::byte_serialize(USAGE_SERVER_ID.as_bytes()).collect::<String>(),
        url::form_urlencoded::byte_serialize(args.as_bytes()).collect::<String>()
    );
    let response = proxy::client_for(&url)?
        .get(&url)
        .header(header::COOKIE, build_cookie_header(auth_cookie))
        .header("X-Server-Id", USAGE_SERVER_ID)
        .header("X-Server-Instance", format!("server-fn:{}", Uuid::new_v4()))
        .header(header::ORIGIN, "https://opencode.ai")
        .header(
            header::REFERER,
            format!("https://opencode.ai/workspace/{workspace_id}/usage"),
        )
        .header(
            header::ACCEPT,
            "text/javascript, application/json;q=0.9, */*;q=0.8",
        )
        .send()
        .await?;
    ensure_success(response.status(), "usage query")?;
    parse_usage_response(&response_text(response).await?)
}

pub fn parse_usage_response(text: &str) -> AppResult<Vec<NewUsageRecord>> {
    let id_regex =
        Regex::new(r#"(?:^|[,\{])\s*"?id"?\s*:\s*("(?:\\.|[^"\\])*")"#).expect("usage id regex");
    let mut occurrences = Vec::new();
    for captures in id_regex.captures_iter(text) {
        let Some(full) = captures.get(0) else {
            continue;
        };
        let Some(literal) = captures.get(1) else {
            continue;
        };
        if let Ok(id) = serde_json::from_str::<String>(literal.as_str()) {
            if id.starts_with("usg_") {
                occurrences.push((id, full.start()));
            }
        }
    }

    let mut partials: HashMap<String, NewUsageRecord> = HashMap::new();
    for (index, (id, start)) in occurrences.iter().enumerate() {
        let end = occurrences
            .get(index + 1)
            .map(|(_, start)| *start)
            .unwrap_or(text.len());
        let fragment = enclosing_object(text, *start).unwrap_or(&text[*start..end]);
        let created_at = extract_created_at(fragment, text);
        let model = extract_string(fragment, "model");
        let input_tokens = extract_i64(fragment, "inputTokens");
        let output_tokens = extract_i64(fragment, "outputTokens");
        let cost_raw = extract_i64(fragment, "cost");
        if let (
            Some(created_at),
            Some(model),
            Some(input_tokens),
            Some(output_tokens),
            Some(cost_raw),
        ) = (created_at, model, input_tokens, output_tokens, cost_raw)
        {
            partials.insert(
                id.clone(),
                NewUsageRecord {
                    usg_id: id.clone(),
                    created_at,
                    model,
                    provider: extract_string(fragment, "provider"),
                    input_tokens,
                    output_tokens,
                    cost_raw,
                    cost_usd: cost_raw as f64 / 1_000_000_000.0,
                    key_id: extract_string(fragment, "keyID")
                        .or_else(|| extract_string(fragment, "keyId")),
                    plan: extract_string(fragment, "plan"),
                },
            );
        }
    }
    let mut records: Vec<_> = partials.into_values().collect();
    records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    if records.is_empty() && (text.contains("usg_") || text.contains("inputTokens")) {
        return Err(AppError::UpstreamFormat(
            "usage response contains records but required fields could not be parsed".into(),
        ));
    }
    Ok(records)
}

fn extract_string(fragment: &str, field: &str) -> Option<String> {
    let regex = Regex::new(&format!(r#""?{field}"?\s*:\s*("(?:\\.|[^"\\])*")"#)).ok()?;
    serde_json::from_str(regex.captures(fragment)?.get(1)?.as_str()).ok()
}

fn extract_i64(fragment: &str, field: &str) -> Option<i64> {
    let value = extract_number(fragment, field)?;
    if value.is_finite() {
        Some(value.trunc() as i64)
    } else {
        None
    }
}

fn extract_created_at(fragment: &str, full_text: &str) -> Option<String> {
    let direct_date = Regex::new(
        r#""?timeCreated"?\s*:\s*(?:\$R\[\d+\]\s*=\s*)?new Date\(\s*("(?:\\.|[^"\\])*")\s*\)"#,
    )
    .ok()?;
    if let Some(value) = direct_date
        .captures(fragment)
        .and_then(|capture| capture.get(1))
    {
        return serde_json::from_str(value.as_str()).ok();
    }
    if let Some(value) =
        extract_string(fragment, "timeCreated").or_else(|| extract_string(fragment, "createdAt"))
    {
        return Some(value);
    }
    let reference = Regex::new(r#""?timeCreated"?\s*:\s*\$R\[(\d+)\]"#)
        .ok()?
        .captures(fragment)?
        .get(1)?
        .as_str()
        .to_string();
    let regex = Regex::new(&format!(
        r#"\$R\[{reference}\]\s*=\s*(?:new Date\(\s*)?("(?:\\.|[^"\\])*")\s*\)?"#
    ))
    .ok()?;
    serde_json::from_str(regex.captures(full_text)?.get(1)?.as_str()).ok()
}

fn enclosing_object(source: &str, position: usize) -> Option<&str> {
    let bytes = source.as_bytes();
    let mut stack = Vec::new();
    let mut in_string = false;
    let mut escaped = false;
    for (index, byte) in bytes.iter().enumerate().take(position + 1) {
        if in_string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                in_string = false;
            }
            continue;
        }
        match *byte {
            b'"' => in_string = true,
            b'{' => stack.push(index),
            b'}' => {
                stack.pop();
            }
            _ => {}
        }
    }
    let start = *stack.last()?;
    let mut depth = 0usize;
    in_string = false;
    escaped = false;
    for (index, byte) in bytes.iter().enumerate().skip(start) {
        if in_string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                in_string = false;
            }
            continue;
        }
        match *byte {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return source.get(start..=index);
                }
            }
            _ => {}
        }
    }
    None
}

fn ensure_success(status: StatusCode, context: &str) -> AppResult<()> {
    if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
        return Err(AppError::Authentication(format!(
            "{context} returned HTTP {}",
            status.as_u16()
        )));
    }
    if status.is_redirection() {
        return Err(AppError::Authentication(format!(
            "{context} redirected; check the workspace and cookie"
        )));
    }
    if !status.is_success() {
        return Err(AppError::Network(format!(
            "{context} returned HTTP {}",
            status.as_u16()
        )));
    }
    Ok(())
}

async fn response_text(response: reqwest::Response) -> AppResult<String> {
    let bytes = response.bytes().await?;
    let bytes = &bytes[..bytes.len().min(MAX_RESPONSE_BYTES)];
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cookie_input_is_normalized() {
        assert_eq!(build_cookie_header("abc"), "auth=abc");
        assert_eq!(
            build_cookie_header("Cookie: x=1; auth=two; y=3"),
            "auth=two"
        );
    }

    #[test]
    fn parses_original_usage_serialization() {
        let response = r#"$R[0]={id:"usg_old",timeCreated:$R[1]=new Date("2026-07-27T15:44:00.000Z"),model:"glm-5.2",provider:"opencode",inputTokens:28264,outputTokens:380,cost:10200000,keyID:"key_old",enrichment:$R[2]={plan:"Go"}}"#;
        let records = parse_usage_response(response).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].usg_id, "usg_old");
        assert_eq!(records[0].cost_usd, 0.0102);
        assert_eq!(records[0].plan.as_deref(), Some("Go"));
    }

    #[test]
    fn parses_reordered_usage_fields_and_referenced_date() {
        let response = r#"$R[8]=new Date("2026-07-27T15:36:00.000Z");$R[0]={"outputTokens":264,"id":"usg_reordered","cost":400000,"inputTokens":30016,"timeCreated":$R[8],"model":"deepseek-v4-pro","enrichment":{"plan":"Go"}}"#;
        let records = parse_usage_response(response).unwrap();
        assert_eq!(records[0].created_at, "2026-07-27T15:36:00.000Z");
        assert_eq!(records[0].model, "deepseek-v4-pro");
    }

    #[test]
    fn incompatible_usage_payload_is_an_error() {
        let response = r#"$R[0]={id:"usg_changed",inputTokens:123,unexpected:"changed"}"#;
        assert!(matches!(
            parse_usage_response(response),
            Err(AppError::UpstreamFormat(_))
        ));
    }

    #[test]
    fn parses_quota_fields_in_any_order() {
        let html = "rollingUsage:$R[1]={resetInSec:120,usagePercent:25.5},weeklyUsage:$R[2]={usagePercent:70,resetInSec:300}";
        let result = parse_quota_html(html, Utc::now()).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].used, 25.5);
        assert_eq!(result[1].remaining, 30.0);
    }
}
