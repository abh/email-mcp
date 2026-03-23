import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
