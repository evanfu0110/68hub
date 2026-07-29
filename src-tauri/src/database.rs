use std::{path::Path, sync::Mutex};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{
        Account, AccountInput, AccountOption, AccountUpdate, DailyModelStat, DailyStat,
        ModelTokenStat, NewUsageRecord, Settings, SettingsUpdate, SyncState, UsagePage, UsageQuery,
        UsageRecord,
    },
};

#[derive(Debug, Clone)]
pub struct StoredAccount {
    pub account: Account,
    pub secret_id: String,
}

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| AppError::Database(e.to_string()))?;
        }
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        #[cfg(target_os = "android")]
        // WAL + shared-memory files are less reliable on some Android OEMs.
        connection.pragma_update(None, "journal_mode", "DELETE")?;
        #[cfg(not(target_os = "android"))]
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        let database = Self {
            connection: Mutex::new(connection),
        };
        database.migrate()?;
        Ok(database)
    }

    fn conn(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| AppError::Database("database lock poisoned".into()))
    }

    fn migrate(&self) -> AppResult<()> {
        let conn = self.conn()?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              workspace_id TEXT NOT NULL DEFAULT 'Default',
              resolved_workspace_id TEXT,
              secret_id TEXT NOT NULL UNIQUE,
              show_rolling INTEGER NOT NULL DEFAULT 1,
              show_weekly INTEGER NOT NULL DEFAULT 1,
              show_monthly INTEGER NOT NULL DEFAULT 1,
              enabled INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS usage_records (
              usg_id TEXT NOT NULL,
              account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
              workspace_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              model TEXT NOT NULL,
              provider TEXT,
              input_tokens INTEGER NOT NULL,
              output_tokens INTEGER NOT NULL,
              cost_raw INTEGER NOT NULL,
              cost_usd REAL NOT NULL,
              key_id TEXT,
              plan TEXT,
              synced_at TEXT NOT NULL,
              PRIMARY KEY (account_id, usg_id)
            );

            CREATE INDEX IF NOT EXISTS idx_usage_account_time
              ON usage_records(account_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_usage_model_time
              ON usage_records(model, created_at DESC);

            CREATE TABLE IF NOT EXISTS usage_sync_state (
              account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
              last_sync_at TEXT,
              last_sync_status TEXT,
              last_sync_error TEXT,
              deepest_page_fetched INTEGER NOT NULL DEFAULT -1,
              total_records INTEGER NOT NULL DEFAULT 0,
              oldest_record_at TEXT,
              newest_record_at TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              theme TEXT NOT NULL DEFAULT 'system',
              language TEXT NOT NULL DEFAULT 'system',
              updated_at TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings (id, theme, language, updated_at)
              VALUES (1, 'system', 'system', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
            INSERT OR IGNORE INTO schema_migrations (version, applied_at)
              VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
            "#,
        )?;
        let has_history_complete: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('usage_sync_state') WHERE name = 'history_complete')",
            [],
            |row| row.get(0),
        )?;
        if !has_history_complete {
            conn.execute(
                "ALTER TABLE usage_sync_state ADD COLUMN history_complete INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            [now_iso()],
        )?;
        let usage_schema: String = conn.query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usage_records'",
            [],
            |row| row.get(0),
        )?;
        if !usage_schema.contains("PRIMARY KEY (account_id, usg_id)") {
            conn.execute_batch(
                r#"
                BEGIN IMMEDIATE;
                DROP INDEX IF EXISTS idx_usage_account_time;
                DROP INDEX IF EXISTS idx_usage_model_time;
                ALTER TABLE usage_records RENAME TO usage_records_v2;
                CREATE TABLE usage_records (
                  usg_id TEXT NOT NULL,
                  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                  workspace_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  model TEXT NOT NULL,
                  provider TEXT,
                  input_tokens INTEGER NOT NULL,
                  output_tokens INTEGER NOT NULL,
                  cost_raw INTEGER NOT NULL,
                  cost_usd REAL NOT NULL,
                  key_id TEXT,
                  plan TEXT,
                  synced_at TEXT NOT NULL,
                  PRIMARY KEY (account_id, usg_id)
                );
                INSERT INTO usage_records SELECT * FROM usage_records_v2;
                DROP TABLE usage_records_v2;
                CREATE INDEX idx_usage_account_time ON usage_records(account_id, created_at DESC);
                CREATE INDEX idx_usage_model_time ON usage_records(model, created_at DESC);
                COMMIT;
                "#,
            )?;
        }
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?1)",
            [now_iso()],
        )?;
        Ok(())
    }

    pub fn list_accounts(&self, enabled_only: bool) -> AppResult<Vec<StoredAccount>> {
        let conn = self.conn()?;
        let sql = if enabled_only {
            "SELECT * FROM accounts WHERE enabled = 1 ORDER BY created_at"
        } else {
            "SELECT * FROM accounts ORDER BY created_at"
        };
        let mut statement = conn.prepare(sql)?;
        let rows = statement.query_map([], map_account)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_account(&self, id: &str) -> AppResult<StoredAccount> {
        self.conn()?
            .query_row("SELECT * FROM accounts WHERE id = ?1", [id], map_account)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("account {id}")))
    }

    pub fn create_account(&self, input: &AccountInput, secret_id: &str) -> AppResult<Account> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation("account name is required".into()));
        }
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let workspace = normalize_workspace(&input.workspace_id);
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            r#"INSERT INTO accounts (
              id, name, workspace_id, secret_id, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)"#,
            params![id, name, workspace, secret_id, now],
        )?;
        tx.execute(
            "INSERT INTO usage_sync_state (account_id) VALUES (?1)",
            [&id],
        )?;
        tx.commit()?;
        drop(conn);
        Ok(self.get_account(&id)?.account)
    }

    pub fn update_account(&self, id: &str, input: &AccountUpdate) -> AppResult<Account> {
        let current = self.get_account(id)?;
        let name = input
            .name
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&current.account.name);
        let workspace = input
            .workspace_id
            .as_deref()
            .map(normalize_workspace)
            .unwrap_or_else(|| current.account.workspace_id.clone());
        self.conn()?.execute(
            r#"UPDATE accounts SET
              name = ?2,
              workspace_id = ?3,
              resolved_workspace_id = CASE WHEN workspace_id != ?3 THEN NULL ELSE resolved_workspace_id END,
              show_rolling = ?4,
              show_weekly = ?5,
              show_monthly = ?6,
              enabled = ?7,
              updated_at = ?8
            WHERE id = ?1"#,
            params![
                id,
                name,
                workspace,
                input.show_rolling.unwrap_or(current.account.show_rolling),
                input.show_weekly.unwrap_or(current.account.show_weekly),
                input.show_monthly.unwrap_or(current.account.show_monthly),
                input.enabled.unwrap_or(current.account.enabled),
                now_iso(),
            ],
        )?;
        Ok(self.get_account(id)?.account)
    }

    pub fn set_resolved_workspace(&self, id: &str, workspace_id: &str) -> AppResult<()> {
        self.conn()?.execute(
            "UPDATE accounts SET resolved_workspace_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, workspace_id, now_iso()],
        )?;
        Ok(())
    }

    pub fn delete_account(&self, id: &str) -> AppResult<String> {
        let stored = self.get_account(id)?;
        self.conn()?
            .execute("DELETE FROM accounts WHERE id = ?1", [id])?;
        Ok(stored.secret_id)
    }

    pub fn insert_usage(
        &self,
        account_id: &str,
        workspace_id: &str,
        records: &[NewUsageRecord],
    ) -> AppResult<usize> {
        if records.is_empty() {
            return Ok(0);
        }
        let synced_at = now_iso();
        let conn = self.conn()?;
        let tx = conn.unchecked_transaction()?;
        let mut inserted = 0;
        {
            let mut statement = tx.prepare(
                r#"INSERT OR IGNORE INTO usage_records (
                  usg_id, account_id, workspace_id, created_at, model, provider,
                  input_tokens, output_tokens, cost_raw, cost_usd, key_id, plan, synced_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
            )?;
            for record in records {
                inserted += statement.execute(params![
                    record.usg_id,
                    account_id,
                    workspace_id,
                    record.created_at,
                    record.model,
                    record.provider,
                    record.input_tokens,
                    record.output_tokens,
                    record.cost_raw,
                    record.cost_usd,
                    record.key_id,
                    record.plan,
                    synced_at,
                ])?;
            }
        }
        tx.commit()?;
        Ok(inserted)
    }

    pub fn sync_state(&self, account_id: &str) -> AppResult<SyncState> {
        self.conn()?
            .query_row(
                "SELECT last_sync_at, last_sync_status, last_sync_error, total_records, oldest_record_at, newest_record_at, deepest_page_fetched, history_complete FROM usage_sync_state WHERE account_id = ?1",
                [account_id],
                |row| {
                    Ok(SyncState {
                        last_sync_at: row.get(0)?,
                        last_sync_status: row.get(1)?,
                        last_sync_error: row.get(2)?,
                        total_records: row.get(3)?,
                        oldest_record_at: row.get(4)?,
                        newest_record_at: row.get(5)?,
                        deepest_page_fetched: row.get(6)?,
                        history_complete: row.get(7)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn update_sync_success(
        &self,
        account_id: &str,
        deepest: i64,
        history_complete: bool,
    ) -> AppResult<()> {
        self.conn()?.execute(
            r#"UPDATE usage_sync_state SET
              last_sync_at = ?2,
              last_sync_status = 'ok',
              last_sync_error = NULL,
              deepest_page_fetched = max(deepest_page_fetched, ?3),
              history_complete = CASE WHEN ?4 THEN 1 ELSE history_complete END,
              total_records = (SELECT count(*) FROM usage_records WHERE account_id = ?1),
              oldest_record_at = (SELECT min(created_at) FROM usage_records WHERE account_id = ?1),
              newest_record_at = (SELECT max(created_at) FROM usage_records WHERE account_id = ?1)
            WHERE account_id = ?1"#,
            params![account_id, now_iso(), deepest, history_complete],
        )?;
        Ok(())
    }

    pub fn update_sync_error(&self, account_id: &str, message: &str) -> AppResult<()> {
        self.conn()?.execute(
            "UPDATE usage_sync_state SET last_sync_at = ?2, last_sync_status = 'error', last_sync_error = ?3 WHERE account_id = ?1",
            params![account_id, now_iso(), message],
        )?;
        Ok(())
    }

    pub fn usage_page(&self, query: &UsageQuery) -> AppResult<UsagePage> {
        let offset = query.offset;
        let limit = query.limit.clamp(1, 200);
        let conn = self.conn()?;
        let (where_clause, account_value) = if let Some(id) = query.account_id.as_deref() {
            ("WHERE ur.account_id = ?1", Some(id))
        } else {
            ("", None)
        };
        let total_count: i64 = if let Some(id) = account_value {
            conn.query_row(
                "SELECT count(*) FROM usage_records WHERE account_id = ?1",
                [id],
                |row| row.get(0),
            )?
        } else {
            conn.query_row("SELECT count(*) FROM usage_records", [], |row| row.get(0))?
        };
        let total = usize::try_from(total_count)
            .map_err(|_| AppError::Database("usage count is out of range".into()))?;
        let limit_value = i64::try_from(limit)
            .map_err(|_| AppError::Validation("usage limit is out of range".into()))?;
        let offset_value = i64::try_from(offset)
            .map_err(|_| AppError::Validation("usage offset is out of range".into()))?;
        let sql = format!(
            r#"SELECT ur.usg_id, ur.account_id, a.name, ur.created_at, ur.model,
              ur.provider, ur.input_tokens, ur.output_tokens, ur.cost_usd, ur.key_id, ur.plan
              FROM usage_records ur JOIN accounts a ON a.id = ur.account_id
              {where_clause} ORDER BY ur.created_at DESC LIMIT ? OFFSET ?"#
        );
        let mut statement = conn.prepare(&sql)?;
        let records = if let Some(id) = account_value {
            statement
                .query_map(params![id, limit_value, offset_value], map_usage)?
                .collect::<Result<Vec<_>, _>>()?
        } else {
            statement
                .query_map(params![limit_value, offset_value], map_usage)?
                .collect::<Result<Vec<_>, _>>()?
        };
        let accounts = self.account_options_with(&conn)?;
        let sync = match query.account_id.as_deref() {
            Some(id) => Some(self.sync_state_with(&conn, id)?),
            None => None,
        };
        Ok(UsagePage {
            records,
            total,
            offset,
            limit,
            accounts,
            sync,
        })
    }

    pub fn recent_usage(&self, limit: usize) -> AppResult<(Vec<UsageRecord>, usize)> {
        self.usage_page(&UsageQuery {
            offset: 0,
            limit,
            account_id: None,
        })
        .map(|page| (page.records, page.total))
    }

    pub fn daily_stats(&self, days: u16, account_id: Option<&str>) -> AppResult<Vec<DailyStat>> {
        let cutoff = format!("-{} days", days.clamp(1, 365));
        let conn = self.conn()?;
        let (sql, has_account) = if account_id.is_some() {
            ("SELECT substr(created_at, 1, 10), sum(cost_usd), count(*) FROM usage_records WHERE substr(created_at, 1, 10) >= date('now', ?1) AND account_id = ?2 GROUP BY 1 ORDER BY 1", true)
        } else {
            ("SELECT substr(created_at, 1, 10), sum(cost_usd), count(*) FROM usage_records WHERE substr(created_at, 1, 10) >= date('now', ?1) GROUP BY 1 ORDER BY 1", false)
        };
        let mut statement = conn.prepare(sql)?;
        let mapper = |row: &Row<'_>| {
            Ok(DailyStat {
                date: row.get(0)?,
                total_cost_usd: row.get(1)?,
                request_count: row.get(2)?,
            })
        };
        if has_account {
            Ok(statement
                .query_map(params![cutoff, account_id], mapper)?
                .collect::<Result<Vec<_>, _>>()?)
        } else {
            Ok(statement
                .query_map([cutoff], mapper)?
                .collect::<Result<Vec<_>, _>>()?)
        }
    }

    pub fn daily_model_stats(
        &self,
        days: u16,
        account_id: Option<&str>,
    ) -> AppResult<Vec<DailyModelStat>> {
        let cutoff = format!("-{} days", days.clamp(1, 365));
        let conn = self.conn()?;
        let base =
            "SELECT substr(created_at, 1, 10), model, sum(cost_usd), count(*) FROM usage_records";
        let sql = if account_id.is_some() {
            format!("{base} WHERE substr(created_at, 1, 10) >= date('now', ?1) AND account_id = ?2 GROUP BY 1, 2 ORDER BY 1, 2")
        } else {
            format!("{base} WHERE substr(created_at, 1, 10) >= date('now', ?1) GROUP BY 1, 2 ORDER BY 1, 2")
        };
        let mut statement = conn.prepare(&sql)?;
        let mapper = |row: &Row<'_>| {
            Ok(DailyModelStat {
                date: row.get(0)?,
                model: row.get(1)?,
                total_cost_usd: row.get(2)?,
                request_count: row.get(3)?,
            })
        };
        if let Some(id) = account_id {
            Ok(statement
                .query_map(params![cutoff, id], mapper)?
                .collect::<Result<Vec<_>, _>>()?)
        } else {
            Ok(statement
                .query_map([cutoff], mapper)?
                .collect::<Result<Vec<_>, _>>()?)
        }
    }

    pub fn model_stats(
        &self,
        range: &str,
        account_id: Option<&str>,
    ) -> AppResult<Vec<ModelTokenStat>> {
        let modifier = match range {
            "5h" => "-5 hours".to_string(),
            "7d" => "-7 days".to_string(),
            "30d" => "-30 days".to_string(),
            value => format!("-{} days", value.parse::<u16>().unwrap_or(30).clamp(1, 365)),
        };
        let conn = self.conn()?;
        let base = "SELECT model, count(*), sum(input_tokens), sum(output_tokens), sum(cost_usd) FROM usage_records";
        let sql = if account_id.is_some() {
            format!("{base} WHERE datetime(created_at) >= datetime('now', ?1) AND account_id = ?2 GROUP BY model ORDER BY sum(input_tokens + output_tokens) DESC")
        } else {
            format!("{base} WHERE datetime(created_at) >= datetime('now', ?1) GROUP BY model ORDER BY sum(input_tokens + output_tokens) DESC")
        };
        let mut statement = conn.prepare(&sql)?;
        let mapper = |row: &Row<'_>| {
            Ok(ModelTokenStat {
                model: row.get(0)?,
                request_count: row.get(1)?,
                total_input_tokens: row.get(2)?,
                total_output_tokens: row.get(3)?,
                total_cost_usd: row.get(4)?,
            })
        };
        if let Some(id) = account_id {
            Ok(statement
                .query_map(params![modifier, id], mapper)?
                .collect::<Result<Vec<_>, _>>()?)
        } else {
            Ok(statement
                .query_map([modifier], mapper)?
                .collect::<Result<Vec<_>, _>>()?)
        }
    }

    pub fn get_settings(&self) -> AppResult<Settings> {
        self.conn()?
            .query_row(
                "SELECT theme, language FROM settings WHERE id = 1",
                [],
                |row| {
                    Ok(Settings {
                        theme: row.get(0)?,
                        language: row.get(1)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn update_settings(&self, input: &SettingsUpdate) -> AppResult<Settings> {
        let current = self.get_settings()?;
        let theme = input.theme.as_deref().unwrap_or(&current.theme);
        let language = input.language.as_deref().unwrap_or(&current.language);
        if !matches!(theme, "light" | "dark" | "system") {
            return Err(AppError::Validation("invalid theme".into()));
        }
        if !matches!(language, "zh" | "en" | "system") {
            return Err(AppError::Validation("invalid language".into()));
        }
        self.conn()?.execute(
            "UPDATE settings SET theme = ?1, language = ?2, updated_at = ?3 WHERE id = 1",
            params![theme, language, now_iso()],
        )?;
        self.get_settings()
    }

    fn account_options_with(&self, conn: &Connection) -> AppResult<Vec<AccountOption>> {
        let mut statement = conn.prepare("SELECT id, name FROM accounts ORDER BY created_at")?;
        let accounts = statement
            .query_map([], |row| {
                Ok(AccountOption {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(accounts)
    }

    fn sync_state_with(&self, conn: &Connection, account_id: &str) -> AppResult<SyncState> {
        Ok(conn.query_row(
            "SELECT last_sync_at, last_sync_status, last_sync_error, total_records, oldest_record_at, newest_record_at, deepest_page_fetched, history_complete FROM usage_sync_state WHERE account_id = ?1",
            [account_id],
            |row| Ok(SyncState {
                last_sync_at: row.get(0)?, last_sync_status: row.get(1)?, last_sync_error: row.get(2)?,
                total_records: row.get(3)?, oldest_record_at: row.get(4)?, newest_record_at: row.get(5)?, deepest_page_fetched: row.get(6)?, history_complete: row.get(7)?,
            }),
        )?)
    }
}

fn map_account(row: &Row<'_>) -> rusqlite::Result<StoredAccount> {
    let secret_id: String = row.get("secret_id")?;
    Ok(StoredAccount {
        account: Account {
            id: row.get("id")?,
            name: row.get("name")?,
            workspace_id: row.get("workspace_id")?,
            resolved_workspace_id: row.get("resolved_workspace_id")?,
            auth_cookie_masked: "••••••••".into(),
            configured: true,
            show_rolling: row.get("show_rolling")?,
            show_weekly: row.get("show_weekly")?,
            show_monthly: row.get("show_monthly")?,
            enabled: row.get("enabled")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        },
        secret_id,
    })
}

fn map_usage(row: &Row<'_>) -> rusqlite::Result<UsageRecord> {
    Ok(UsageRecord {
        usg_id: row.get(0)?,
        account_id: row.get(1)?,
        account_name: row.get(2)?,
        created_at: row.get(3)?,
        model: row.get(4)?,
        provider: row.get(5)?,
        input_tokens: row.get(6)?,
        output_tokens: row.get(7)?,
        cost_usd: row.get(8)?,
        key_id: row.get(9)?,
        plan: row.get(10)?,
    })
}

fn normalize_workspace(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        "Default".into()
    } else {
        value.into()
    }
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> (tempfile::TempDir, Database) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("test.db")).unwrap();
        (dir, db)
    }

    #[test]
    fn database_never_stores_cookie() {
        let (_dir, db) = test_db();
        db.create_account(
            &AccountInput {
                name: "test".into(),
                workspace_id: "wrk_test".into(),
                auth_cookie: "super-secret".into(),
            },
            "account/test",
        )
        .unwrap();
        let conn = db.conn().unwrap();
        let schema: String = conn
            .query_row("SELECT group_concat(sql) FROM sqlite_master", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(!schema.contains("auth_cookie"));
        let dump: String = conn
            .query_row(
                "SELECT group_concat(name || workspace_id || secret_id) FROM accounts",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!dump.contains("super-secret"));
    }

    #[test]
    fn deleting_account_cascades_usage() {
        let (_dir, db) = test_db();
        let account = db
            .create_account(
                &AccountInput {
                    name: "test".into(),
                    workspace_id: "wrk_test".into(),
                    auth_cookie: "secret".into(),
                },
                "account/test",
            )
            .unwrap();
        db.insert_usage(
            &account.id,
            "wrk_test",
            &[NewUsageRecord {
                usg_id: "usg_1".into(),
                created_at: now_iso(),
                model: "model".into(),
                provider: None,
                input_tokens: 10,
                output_tokens: 2,
                cost_raw: 1000,
                cost_usd: 0.000001,
                key_id: None,
                plan: None,
            }],
        )
        .unwrap();
        db.delete_account(&account.id).unwrap();
        assert_eq!(
            db.usage_page(&UsageQuery {
                offset: 0,
                limit: 50,
                account_id: None
            })
            .unwrap()
            .total,
            0
        );
    }

    #[test]
    fn usage_ids_are_deduplicated_per_account_and_accounts_stay_isolated() {
        let (_dir, db) = test_db();
        let create = |name: &str, secret_id: &str| {
            db.create_account(
                &AccountInput {
                    name: name.into(),
                    workspace_id: "wrk_shared".into(),
                    auth_cookie: "never-stored".into(),
                },
                secret_id,
            )
            .unwrap()
        };
        let first = create("first", "secret/first");
        let second = create("second", "secret/second");
        let record = NewUsageRecord {
            usg_id: "usg_shared".into(),
            created_at: now_iso(),
            model: "model".into(),
            provider: None,
            input_tokens: 10,
            output_tokens: 2,
            cost_raw: 1000,
            cost_usd: 0.000001,
            key_id: None,
            plan: None,
        };

        assert_eq!(
            db.insert_usage(&first.id, "wrk_shared", &[record.clone()])
                .unwrap(),
            1
        );
        assert_eq!(
            db.insert_usage(&first.id, "wrk_shared", &[record.clone()])
                .unwrap(),
            0
        );
        assert_eq!(
            db.insert_usage(&second.id, "wrk_shared", &[record])
                .unwrap(),
            1
        );
        for account_id in [&first.id, &second.id] {
            assert_eq!(
                db.usage_page(&UsageQuery {
                    offset: 0,
                    limit: 50,
                    account_id: Some(account_id.clone()),
                })
                .unwrap()
                .total,
                1
            );
        }
        let schema_version: i64 = db
            .conn()
            .unwrap()
            .query_row("SELECT max(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(schema_version, 3);
    }
}
