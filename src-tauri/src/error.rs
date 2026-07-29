use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("authentication failed: {0}")]
    Authentication(String),
    #[error("network request failed: {0}")]
    Network(String),
    #[error("system proxy resolution failed: {0}")]
    ProxyResolution(String),
    #[error("OpenCode response format changed: {0}")]
    UpstreamFormat(String),
    #[error("database operation failed: {0}")]
    Database(String),
    #[error("secure credential store failed: {0}")]
    SecretStore(String),
    #[error("sync was cancelled")]
    SyncCancelled,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    Validation(String),
    #[error("a sync is already running for this account")]
    SyncConflict,
}

#[derive(Debug, Serialize)]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(value: reqwest::Error) -> Self {
        Self::Network(value.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let (code, retryable) = match self {
            Self::Authentication(_) => ("AUTHENTICATION", false),
            Self::Network(_) => ("NETWORK", true),
            Self::ProxyResolution(_) => ("PROXY_RESOLUTION", true),
            Self::UpstreamFormat(_) => ("UPSTREAM_FORMAT", false),
            Self::Database(_) => ("DATABASE", true),
            Self::SecretStore(_) => ("SECRET_STORE", false),
            Self::SyncCancelled => ("SYNC_CANCELLED", true),
            Self::NotFound(_) => ("NOT_FOUND", false),
            Self::Validation(_) => ("VALIDATION", false),
            Self::SyncConflict => ("SYNC_CONFLICT", true),
        };
        ErrorPayload {
            code,
            message: self.to_string(),
            retryable,
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
