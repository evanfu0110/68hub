use tauri::AppHandle;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

mod backend {
    pub use crate::secret_file::{get, remove, set};
}

const SECRET_PREFIX: &str = "opencode.cookie";

pub fn new_secret_id() -> String {
    format!("{SECRET_PREFIX}.{}", Uuid::new_v4())
}

pub fn set(app: &AppHandle, secret_id: &str, value: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::Validation("auth cookie is required".into()));
    }
    backend::set(app, secret_id, value.trim())
}

pub fn get(app: &AppHandle, secret_id: &str) -> AppResult<String> {
    backend::get(app, secret_id)
}

pub fn remove(app: &AppHandle, secret_id: &str) -> AppResult<()> {
    backend::remove(app, secret_id)
}
