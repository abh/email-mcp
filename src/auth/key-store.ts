import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const KEY_LENGTH = 32;
const KEYCHAIN_SERVICE = 'email-mcp';
const KEYCHAIN_ACCOUNT = 'encryption-key';
const KEYCHAIN_NOT_FOUND = 44;

let cachedKey: Buffer | undefined;

export function resetKeyCache(): void {
  cachedKey = undefined;
}

export function getConfigDir(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'email-mcp');
  }
  if (platform === 'linux' || platform === 'freebsd' || platform === 'openbsd') {
    const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
    return path.join(xdg, 'email-mcp');
  }
  throw new Error(`Platform "${platform}" is not yet supported by email-mcp`);
}

function readKeychainKey(): Buffer | null {
  try {
    const hex = execFileSync('security', [
      'find-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-a', KEYCHAIN_ACCOUNT,
      '-w',
    ], { encoding: 'utf-8' }).trim();
    return validateHexKey(hex);
  } catch (err: unknown) {
    if (isExitCodeError(err) && err.status === KEYCHAIN_NOT_FOUND) {
      return null;
    }
    throw err;
  }
}

function writeKeychainKey(key: Buffer): void {
  const hex = key.toString('hex');
  execFileSync('security', [
    'add-generic-password',
    '-U',
    '-s', KEYCHAIN_SERVICE,
    '-a', KEYCHAIN_ACCOUNT,
    '-w', hex,
  ]);
}

function readFileKey(dir: string): Buffer | null {
  const keyFile = path.join(dir, 'encryption.key');
  if (!fs.existsSync(keyFile)) {
    return null;
  }
  const hex = fs.readFileSync(keyFile, 'utf-8').trim();
  return validateHexKey(hex);
}

function writeFileKey(dir: string, key: Buffer): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const keyFile = path.join(dir, 'encryption.key');
  const tmpFile = keyFile + '.tmp';
  fs.writeFileSync(tmpFile, key.toString('hex'), { mode: 0o600 });
  fs.renameSync(tmpFile, keyFile);
}

function validateHexKey(hex: string): Buffer {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `Encryption key is ${buf.length} bytes, expected ${KEY_LENGTH}. ` +
      'The key file may be corrupt or truncated.',
    );
  }
  // Verify round-trip: if the hex contained invalid characters,
  // Buffer.from silently drops them, producing a shorter buffer.
  // The length check above catches that, but let's also verify
  // the hex string itself is the right length.
  if (hex.length !== KEY_LENGTH * 2) {
    throw new Error(
      `Encryption key hex is ${hex.length} characters, expected ${KEY_LENGTH * 2}. ` +
      'The key file may be corrupt.',
    );
  }
  return buf;
}

function isExitCodeError(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number';
}

export function getOrCreateEncryptionKey(dirOverride?: string): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const useKeychain = !dirOverride && process.platform === 'darwin';

  if (useKeychain) {
    const existing = readKeychainKey();
    if (existing) {
      cachedKey = existing;
      return cachedKey;
    }
    const newKey = crypto.randomBytes(KEY_LENGTH);
    writeKeychainKey(newKey);
    cachedKey = newKey;
    return cachedKey;
  }

  const dir = dirOverride ?? getConfigDir();
  const existing = readFileKey(dir);
  if (existing) {
    cachedKey = existing;
    return cachedKey;
  }

  const newKey = crypto.randomBytes(KEY_LENGTH);
  writeFileKey(dir, newKey);
  cachedKey = newKey;
  return cachedKey;
}
