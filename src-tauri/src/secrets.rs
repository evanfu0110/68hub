use tauri::AppHandle;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[cfg(target_os = "android")]
mod backend {
    pub use crate::secret_file::{get, remove, set};
}

#[cfg(target_os = "windows")]
mod backend {
    use tauri::AppHandle;
    use tauri_plugin_keyring_store::KeyringExt;

    use crate::error::{AppError, AppResult};

    pub fn set(app: &AppHandle, secret_id: &str, value: &str) -> AppResult<()> {
        app.keyring()
            .store
            .set_password(secret_id, value)
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }

    pub fn get(app: &AppHandle, secret_id: &str) -> AppResult<String> {
        app.keyring()
            .store
            .get_password(secret_id)
            .map_err(|e| AppError::SecretStore(e.to_string()))?
            .ok_or_else(|| {
                AppError::SecretStore("credential is missing or the device is locked".into())
            })
    }

    pub fn remove(app: &AppHandle, secret_id: &str) -> AppResult<()> {
        app.keyring()
            .store
            .delete(secret_id)
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }
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
