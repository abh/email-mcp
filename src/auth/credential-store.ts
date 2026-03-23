import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AccountCredentials } from '../models/types.js';
import { getConfigDir, getOrCreateEncryptionKey } from './key-store.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted,
  });
}

function decrypt(ciphertext: string, key: Buffer): string {
  const { iv, authTag, data } = JSON.parse(ciphertext);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

/**
 * Attempt to decrypt using the old hostname-derived key scheme.
 * Returns null if decryption fails (hostname changed).
 */
function decryptLegacy(ciphertext: string): string | null {
  try {
    const { salt, iv, authTag, data } = JSON.parse(ciphertext);
    const seed = `email-mcp:${os.hostname()}:${os.userInfo().username}`;
    const key = crypto.pbkdf2Sync(seed, Buffer.from(salt, 'hex'), 100_000, 32, 'sha512');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Migrate credentials and cache from legacy ~/.email-mcp/ to new config dir.
 * - msal-cache.json: copied as-is (plaintext)
 * - credentials.enc: re-encrypted under new key if old hostname-derived key works;
 *   renamed to .bak if decryption fails
 * - On full success, removes the old directory
 */
export function migrateFromLegacyDir(oldDir: string, newDir: string, dirOverride?: string): void {
  if (!fs.existsSync(oldDir)) return;

  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true, mode: 0o700 });
  }

  let fullSuccess = true;

  // Copy msal-cache.json
  const msalSrc = path.join(oldDir, 'msal-cache.json');
  const msalDst = path.join(newDir, 'msal-cache.json');
  if (fs.existsSync(msalSrc) && !fs.existsSync(msalDst)) {
    fs.copyFileSync(msalSrc, msalDst);
  }

  // Re-encrypt credentials
  const credSrc = path.join(oldDir, 'credentials.enc');
  const credDst = path.join(newDir, 'credentials.enc');
  if (fs.existsSync(credSrc) && !fs.existsSync(credDst)) {
    const raw = fs.readFileSync(credSrc, 'utf-8');
    const plaintext = decryptLegacy(raw);
    if (plaintext) {
      JSON.parse(plaintext); // Verify valid JSON
      const newKey = getOrCreateEncryptionKey(dirOverride);
      const reEncrypted = encrypt(plaintext, newKey);
      fs.writeFileSync(credDst, reEncrypted, { mode: 0o600 });
      console.error('Migrated credentials to ' + newDir);
    } else {
      fullSuccess = false;
      fs.renameSync(credSrc, credSrc + '.bak');
      console.error(
        'Could not migrate credentials (hostname may have changed). Re-run setup to re-authenticate your accounts.'
      );
    }
  }

  // Clean up old directory on full success
  if (fullSuccess) {
    try {
      fs.rmSync(oldDir, { recursive: true });
    } catch {
      // Not critical -- old dir may have other files or be locked
    }
  }
}

interface StoredData {
  accounts: Record<string, AccountCredentials>;
}

export class CredentialStore {
  private configDir: string;
  private filePath: string;
  private key: Buffer | null = null;
  private dirOverride: string | undefined;

  constructor(dir?: string) {
    this.dirOverride = dir;
    this.configDir = dir ?? getConfigDir();
    if (!dir) {
      // Only run migration for default config dir (not test overrides)
      migrateFromLegacyDir(path.join(os.homedir(), '.email-mcp'), this.configDir, this.dirOverride);
    }
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
    this.filePath = path.join(this.configDir, 'credentials.enc');
  }

  private getKey(): Buffer {
    if (!this.key) {
      this.key = getOrCreateEncryptionKey(this.dirOverride);
    }
    return this.key;
  }

  private read(): StoredData {
    if (!fs.existsSync(this.filePath)) {
      return { accounts: {} };
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const json = decrypt(raw, this.getKey());
      return JSON.parse(json);
    } catch {
      const backupPath = this.filePath + '.bak';
      fs.renameSync(this.filePath, backupPath);
      console.error(
        `Credentials file could not be decrypted. Backup saved as ${backupPath}. Re-run setup to re-authenticate.`
      );
      return { accounts: {} };
    }
  }

  private write(data: StoredData): void {
    const json = JSON.stringify(data);
    const encrypted = encrypt(json, this.getKey());
    fs.writeFileSync(this.filePath, encrypted, { mode: 0o600 });
  }

  async save(creds: AccountCredentials): Promise<void> {
    const data = this.read();
    data.accounts[creds.id] = creds;
    this.write(data);
  }

  async get(id: string): Promise<AccountCredentials | null> {
    const data = this.read();
    return data.accounts[id] ?? null;
  }

  async list(): Promise<AccountCredentials[]> {
    const data = this.read();
    return Object.values(data.accounts);
  }

  async remove(id: string): Promise<void> {
    const data = this.read();
    delete data.accounts[id];
    this.write(data);
  }
}
