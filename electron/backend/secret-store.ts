import type { SafeStorage } from 'electron';

export const SECRET_PREFIX = 'v1:';

let _safeStorage: SafeStorage | null | undefined;

function safeStorage(): SafeStorage | null {
  if (_safeStorage !== undefined) return _safeStorage;
  try {
    // Lazy require keeps this module loadable outside Electron (e.g. plain-Node
    // use of the backend), where it falls back to plaintext storage.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { safeStorage?: SafeStorage };
    _safeStorage = electron?.safeStorage ?? null;
  } catch {
    _safeStorage = null;
  }
  return _safeStorage;
}

export function encryptionAvailable(): boolean {
  const ss = safeStorage();
  if (!ss) return false;
  try {
    return ss.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const ss = safeStorage();
  if (!ss || !encryptionAvailable()) return plain;
  return SECRET_PREFIX + ss.encryptString(plain).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith(SECRET_PREFIX)) return stored;
  const ss = safeStorage();
  if (!ss || !encryptionAvailable()) {
    // Cookie would be silently lost here (e.g. system reinstall made the
    // platform keyring/DPAPI unavailable). Log so the user has a chance to
    // notice; never log the ciphertext itself.
    console.warn('[secret-store] 加密不可用，v1: 密文无法解密，cookie 将丢失');
    return '';
  }
  try {
    return ss.decryptString(Buffer.from(stored.slice(SECRET_PREFIX.length), 'base64'));
  } catch (err) {
    // Ciphertext corrupted or moved across machines. Fail visibly instead of
    // silently wiping the account cookie.
    console.warn('[secret-store] 解密失败，cookie 将丢失:', err);
    return '';
  }
}
