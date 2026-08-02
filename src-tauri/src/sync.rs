use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

use futures::future::try_join_all;

use crate::{
    database::{now_iso, Database, StoredAccount},
    error::{AppError, AppResult},
    models::{NewUsageRecord, SyncProgress, SyncResult},
    opencode::{fetch_usage_page, resolve_workspace_id, USAGE_PAGE_SIZE},
};

const BATCH_SIZE: usize = 5;
const MAX_PAGES_PER_RUN: usize = 10_000;

type FetchFuture<'a> = Pin<Box<dyn Future<Output = AppResult<Vec<NewUsageRecord>>> + Send + 'a>>;

trait UsagePageFetcher: Send + Sync {
    fn fetch<'a>(
        &'a self,
        workspace_id: &'a str,
        auth_cookie: &'a str,
        page: usize,
    ) -> FetchFuture<'a>;
}

struct OpenCodePageFetcher;

impl UsagePageFetcher for OpenCodePageFetcher {
    fn fetch<'a>(
        &'a self,
        workspace_id: &'a str,
        auth_cookie: &'a str,
        page: usize,
    ) -> FetchFuture<'a> {
        Box::pin(fetch_usage_page(workspace_id, auth_cookie, page))
    }
}

pub struct SyncManager {
    running: Mutex<HashSet<String>>,
    progress: Mutex<HashMap<String, SyncProgress>>,
    cancelled: AtomicBool,
}

impl Default for SyncManager {
    fn default() -> Self {
        Self {
            running: Mutex::new(HashSet::new()),
            progress: Mutex::new(HashMap::new()),
            cancelled: AtomicBool::new(false),
        }
    }
}

struct RunningGuard<'a> {
    manager: &'a SyncManager,
    account_id: String,
}

impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut running) = self.manager.running.lock() {
            running.remove(&self.account_id);
        }
    }
}

impl SyncManager {
    fn begin(&self, account_id: &str) -> AppResult<RunningGuard<'_>> {
        let mut running = self
            .running
            .lock()
            .map_err(|_| AppError::Database("sync lock poisoned".into()))?;
        if !running.insert(account_id.to_string()) {
            return Err(AppError::SyncConflict);
        }
        self.cancelled.store(false, Ordering::SeqCst);
        self.set_progress(
            account_id,
            SyncProgress {
                status: "running".into(),
                current: 0,
                total: 0,
                inserted: 0,
                error: None,
            },
        );
        Ok(RunningGuard {
            manager: self,
            account_id: account_id.to_string(),
        })
    }

    pub fn progress(&self, account_id: &str) -> SyncProgress {
        self.progress
            .lock()
            .ok()
            .and_then(|values| values.get(account_id).cloned())
            .unwrap_or_default()
    }

    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    pub fn cancel_all(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn ensure_not_cancelled(&self) -> AppResult<()> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err(AppError::SyncCancelled)
        } else {
            Ok(())
        }
    }

    fn set_progress(&self, account_id: &str, progress: SyncProgress) {
        if let Ok(mut values) = self.progress.lock() {
            values.insert(account_id.to_string(), progress);
        }
    }

    pub async fn sync(
        &self,
        database: &Database,
        account: &StoredAccount,
        auth_cookie: &str,
    ) -> AppResult<SyncResult> {
        self.sync_with_fetcher(database, account, auth_cookie, &OpenCodePageFetcher)
            .await
    }

    async fn sync_with_fetcher<F: UsagePageFetcher>(
        &self,
        database: &Database,
        account: &StoredAccount,
        auth_cookie: &str,
        fetcher: &F,
    ) -> AppResult<SyncResult> {
        let guard = self.begin(&account.account.id)?;
        let result = self
            .sync_inner(database, account, auth_cookie, fetcher)
            .await;
        let progress = match &result {
            Ok(result) => SyncProgress {
                status: "done".into(),
                current: result.pages_fetched,
                total: result.pages_fetched,
                inserted: result.inserted,
                error: None,
            },
            Err(error) => SyncProgress {
                status: if matches!(error, AppError::SyncCancelled) {
                    "cancelled"
                } else {
                    "error"
                }
                .into(),
                current: self.progress(&account.account.id).current,
                total: 0,
                inserted: self.progress(&account.account.id).inserted,
                error: Some(error.to_string()),
            },
        };
        self.set_progress(&account.account.id, progress);
        drop(guard);
        result
    }

    async fn sync_inner<F: UsagePageFetcher>(
        &self,
        database: &Database,
        account: &StoredAccount,
        auth_cookie: &str,
        fetcher: &F,
    ) -> AppResult<SyncResult> {
        let account_id = &account.account.id;
        let workspace_id = match account.account.resolved_workspace_id.as_deref() {
            Some(id) => id.to_string(),
            None => {
                let id = resolve_workspace_id(&account.account.workspace_id, auth_cookie).await?;
                database.set_resolved_workspace(account_id, &id)?;
                id
            }
        };
        let state = database.sync_state(account_id)?;
        let mut inserted = 0usize;
        let mut pages_fetched = 0usize;
        let mut deepest = state.deepest_page_fetched;
        let mut history_complete = state.history_complete;

        if deepest >= 0 {
            for page in 0..=(deepest as usize) {
                self.ensure_not_cancelled()?;
                let records = fetcher.fetch(&workspace_id, auth_cookie, page).await?;
                pages_fetched += 1;
                let new_count = database.insert_usage(account_id, &workspace_id, &records)?;
                inserted += new_count;
                self.set_progress(
                    account_id,
                    SyncProgress {
                        status: "running".into(),
                        current: pages_fetched,
                        total: 0,
                        inserted,
                        error: None,
                    },
                );
                if records.len() < USAGE_PAGE_SIZE {
                    history_complete = true;
                    break;
                }
                if page as i64 == deepest && new_count > 0 {
                    history_complete = false;
                }
                if new_count == 0 {
                    break;
                }
            }
        }

        if history_complete {
            database.update_sync_success(account_id, deepest, true)?;
            return Ok(SyncResult {
                inserted,
                pages_fetched,
                sync_at: now_iso(),
            });
        }

        let mut page = (deepest + 1).max(0) as usize;
        while page < MAX_PAGES_PER_RUN {
            self.ensure_not_cancelled()?;
            let pages: Vec<_> = (page..(page + BATCH_SIZE).min(MAX_PAGES_PER_RUN)).collect();
            let fetched = try_join_all(
                pages
                    .iter()
                    .map(|value| fetcher.fetch(&workspace_id, auth_cookie, *value)),
            )
            .await?;
            let mut reached_end = false;
            let mut last_successful_page = None;
            for (page_number, records) in pages.into_iter().zip(fetched) {
                self.ensure_not_cancelled()?;
                pages_fetched += 1;
                inserted += database.insert_usage(account_id, &workspace_id, &records)?;
                last_successful_page = Some(page_number as i64);
                self.set_progress(
                    account_id,
                    SyncProgress {
                        status: "running".into(),
                        current: pages_fetched,
                        total: 0,
                        inserted,
                        error: None,
                    },
                );
                if records.len() < USAGE_PAGE_SIZE {
                    reached_end = true;
                    break;
                }
            }
            if let Some(last) = last_successful_page {
                deepest = deepest.max(last);
                database.update_sync_success(account_id, deepest, reached_end)?;
                page = last as usize + 1;
            }
            if reached_end {
                history_complete = true;
                break;
            }
        }
        let sync_at = now_iso();
        database.update_sync_success(account_id, deepest, history_complete)?;
        Ok(SyncResult {
            inserted,
            pages_fetched,
            sync_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AccountInput;

    struct MockFetcher {
        last_page: usize,
        final_count: usize,
        fail_once: Mutex<Option<usize>>,
        calls: Mutex<Vec<usize>>,
    }

    impl MockFetcher {
        fn new(last_page: usize, final_count: usize, fail_once: Option<usize>) -> Self {
            Self {
                last_page,
                final_count,
                fail_once: Mutex::new(fail_once),
                calls: Mutex::new(Vec::new()),
            }
        }

        fn record(page: usize, index: usize) -> NewUsageRecord {
            NewUsageRecord {
                usg_id: format!("usg_{page}_{index}"),
                created_at: format!("2026-07-{:02}T12:00:00Z", 28 - page.min(27)),
                model: "test-model".into(),
                provider: Some("test".into()),
                input_tokens: 100,
                output_tokens: 20,
                cost_raw: 1_000,
                cost_usd: 0.000001,
                key_id: None,
                plan: Some("Go".into()),
            }
        }
    }

    impl UsagePageFetcher for MockFetcher {
        fn fetch<'a>(
            &'a self,
            _workspace_id: &'a str,
            _auth_cookie: &'a str,
            page: usize,
        ) -> FetchFuture<'a> {
            Box::pin(async move {
                self.calls.lock().unwrap().push(page);
                let should_fail = {
                    let mut fail_once = self.fail_once.lock().unwrap();
                    if fail_once.as_ref() == Some(&page) {
                        fail_once.take();
                        true
                    } else {
                        false
                    }
                };
                if should_fail {
                    return Err(AppError::Network(format!("page {page} failed")));
                }
                let count = if page < self.last_page {
                    USAGE_PAGE_SIZE
                } else if page == self.last_page {
                    self.final_count
                } else {
                    0
                };
                Ok((0..count).map(|index| Self::record(page, index)).collect())
            })
        }
    }

    fn test_account() -> (tempfile::TempDir, Database, StoredAccount) {
        let dir = tempfile::tempdir().unwrap();
        let database = Database::open(&dir.path().join("sync.db")).unwrap();
        let account = database
            .create_account(
                &AccountInput {
                    name: "sync-test".into(),
                    workspace_id: "wrk_test".into(),
                    auth_cookie: "not-stored".into(),
                },
                "test-secret-id",
            )
            .unwrap();
        database
            .set_resolved_workspace(&account.id, "wrk_test")
            .unwrap();
        let stored = database.get_account(&account.id).unwrap();
        (dir, database, stored)
    }

    #[tokio::test]
    async fn first_sync_stops_at_the_end_and_incremental_sync_does_not_walk_empty_pages() {
        let (_dir, database, account) = test_account();
        let fetcher = MockFetcher::new(1, 2, None);
        let manager = SyncManager::default();

        let first = manager
            .sync_with_fetcher(&database, &account, "cookie", &fetcher)
            .await
            .unwrap();
        assert_eq!(first.inserted, 52);
        assert_eq!(first.pages_fetched, 2);
        let state = database.sync_state(&account.account.id).unwrap();
        assert_eq!(state.deepest_page_fetched, 1);
        assert!(state.history_complete);

        let second = manager
            .sync_with_fetcher(&database, &account, "cookie", &fetcher)
            .await
            .unwrap();
        assert_eq!(second.inserted, 0);
        assert_eq!(second.pages_fetched, 1);
        assert_eq!(
            database
                .sync_state(&account.account.id)
                .unwrap()
                .deepest_page_fetched,
            1
        );
    }

    #[tokio::test]
    async fn failed_batch_resumes_from_the_failed_batch_without_skipping() {
        let (_dir, database, account) = test_account();
        let fetcher = MockFetcher::new(3, 1, Some(2));
        let manager = SyncManager::default();

        let first = manager
            .sync_with_fetcher(&database, &account, "cookie", &fetcher)
            .await;
        assert!(matches!(first, Err(AppError::Network(_))));
        let failed_state = database.sync_state(&account.account.id).unwrap();
        assert_eq!(failed_state.deepest_page_fetched, -1);
        assert_eq!(failed_state.total_records, 0);

        let resumed = manager
            .sync_with_fetcher(&database, &account, "cookie", &fetcher)
            .await
            .unwrap();
        assert_eq!(resumed.inserted, 151);
        let resumed_state = database.sync_state(&account.account.id).unwrap();
        assert_eq!(resumed_state.deepest_page_fetched, 3);
        assert_eq!(resumed_state.total_records, 151);
        assert!(resumed_state.history_complete);
        assert!(
            fetcher
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|page| **page == 2)
                .count()
                >= 2
        );
    }

    #[test]
    fn only_one_sync_can_run_per_account() {
        let manager = SyncManager::default();
        let running = manager.begin("account").unwrap();
        assert!(matches!(
            manager.begin("account"),
            Err(AppError::SyncConflict)
        ));
        drop(running);
        assert!(manager.begin("account").is_ok());
    }
}
