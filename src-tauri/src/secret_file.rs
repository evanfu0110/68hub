use std::{
    fs,
    path::{Path, PathBuf},
};

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

const MASTER_KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;

fn map_io(error: std::io::Error) -> AppError {
    AppError::SecretStore(error.to_string())
}

fn map_crypto(error: impl ToString) -> AppError {
    AppError::SecretStore(error.to_string())
}

fn secrets_root(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::SecretStore(error.to_string()))?
        .join("secrets");
    fs::create_dir_all(&dir).map_err(map_io)?;
    fs::create_dir_all(dir.join("entries")).map_err(map_io)?;
    Ok(dir)
}

fn sanitize_secret_id(secret_id: &str) -> AppResult<String> {
    let trimmed = secret_id.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
    {
        return Err(AppError::SecretStore("invalid secret id".into()));
    }
    Ok(trimmed.replace(':', "_"))
}

fn entry_path(root: &Path, secret_id: &str) -> AppResult<PathBuf> {
    Ok(root
        .join("entries")
        .join(format!("{}.bin", sanitize_secret_id(secret_id)?)))
}

fn load_or_create_master_key(root: &Path) -> AppResult<[u8; MASTER_KEY_LEN]> {
    let path = root.join("master.key");
    if path.exists() {
        let bytes = fs::read(&path).map_err(map_io)?;
        if bytes.len() != MASTER_KEY_LEN {
            return Err(AppError::SecretStore(
                "secret master key is corrupted".into(),
            ));
        }
        let mut key = [0u8; MASTER_KEY_LEN];
        key.copy_from_slice(&bytes);
        return Ok(key);
    }

    let mut key = [0u8; MASTER_KEY_LEN];
    getrandom::getrandom(&mut key).map_err(map_crypto)?;
    fs::write(&path, key).map_err(map_io)?;
    Ok(key)
}

fn encrypt(key: &[u8; MASTER_KEY_LEN], plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(map_crypto)?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    getrandom::getrandom(&mut nonce_bytes).map_err(map_crypto)?;
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| AppError::SecretStore("failed to encrypt secret".into()))?;
    let mut packed = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ciphertext);
    Ok(packed)
}

fn decrypt(key: &[u8; MASTER_KEY_LEN], packed: &[u8]) -> AppResult<Vec<u8>> {
    if packed.len() <= NONCE_LEN {
        return Err(AppError::SecretStore("secret payload is corrupted".into()));
    }
    let (nonce_bytes, ciphertext) = packed.split_at(NONCE_LEN);
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(map_crypto)?;
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(nonce_bytes);
    let nonce = Nonce::from(nonce);
    cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| AppError::SecretStore("failed to decrypt secret".into()))
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn set(app: &AppHandle, secret_id: &str, value: &str) -> AppResult<()> {
    let root = secrets_root(app)?;
    let key = load_or_create_master_key(&root)?;
    let path = entry_path(&root, secret_id)?;
    let packed = encrypt(&key, value.as_bytes())?;
    fs::write(path, packed).map_err(map_io)
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn get(app: &AppHandle, secret_id: &str) -> AppResult<String> {
    let root = secrets_root(app)?;
    let key = load_or_create_master_key(&root)?;
    let path = entry_path(&root, secret_id)?;
    let packed = fs::read(&path).map_err(|_| {
        AppError::SecretStore("credential is missing or the device is locked".into())
    })?;
    let plain = decrypt(&key, &packed)?;
    String::from_utf8(plain)
        .map_err(|_| AppError::SecretStore("credential encoding is invalid".into()))
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn remove(app: &AppHandle, secret_id: &str) -> AppResult<()> {
    let root = secrets_root(app)?;
    let path = entry_path(&root, secret_id)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(map_io(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::{decrypt, encrypt, NONCE_LEN};

    #[test]
    fn roundtrip_encrypts_cookie() {
        let key = [7u8; 32];
        let packed = encrypt(&key, b"session=abc; token=xyz").unwrap();
        let plain = decrypt(&key, &packed).unwrap();
        assert_eq!(plain, b"session=abc; token=xyz");
        assert_ne!(&packed[NONCE_LEN..], b"session=abc; token=xyz");
    }
}
