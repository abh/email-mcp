import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { resetKeyCache } from '../../src/auth/key-store.js';
import { migrateFromLegacyDir } from '../../src/auth/credential-store.js';

// Reproduce the old encryption scheme for test fixtures
const PBKDF2_ITERATIONS = 100_000;
function oldEncrypt(plaintext: string, hostname: string, username: string): string {
  const seed = `email-mcp:${hostname}:${username}`;
  const salt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(seed, salt, PBKDF2_ITERATIONS, 32, 'sha512');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted,
  });
}

describe('migrateFromLegacyDir', () => {
  let oldDir: string;
  let newDir: string;

  beforeEach(() => {
    oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-mcp-old-'));
    newDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-mcp-new-'));
    resetKeyCache();
  });

  afterEach(() => {
    fs.rmSync(oldDir, { recursive: true, force: true });
    fs.rmSync(newDir, { recursive: true, force: true });
    resetKeyCache();
  });

  it('migrates msal-cache.json', () => {
    fs.writeFileSync(path.join(oldDir, 'msal-cache.json'), '{"tokens":{}}');
    migrateFromLegacyDir(oldDir, newDir);
    expect(fs.existsSync(path.join(newDir, 'msal-cache.json'))).toBe(true);
    expect(fs.readFileSync(path.join(newDir, 'msal-cache.json'), 'utf-8')).toBe('{"tokens":{}}');
  });

  it('re-encrypts credentials when hostname matches', () => {
    const accounts = { accounts: { 'a1': { id: 'a1', name: 'Test', provider: 'gmail', email: 'test@example.com' } } };
    const encrypted = oldEncrypt(JSON.stringify(accounts), os.hostname(), os.userInfo().username);
    fs.writeFileSync(path.join(oldDir, 'credentials.enc'), encrypted);

    migrateFromLegacyDir(oldDir, newDir);

    expect(fs.existsSync(path.join(newDir, 'credentials.enc'))).toBe(true);
    expect(fs.existsSync(path.join(oldDir, 'credentials.enc.bak'))).toBe(false);
  });

  it('creates .bak when hostname does not match', () => {
    const encrypted = oldEncrypt('{"accounts":{}}', 'wrong-hostname', 'wrong-user');
    fs.writeFileSync(path.join(oldDir, 'credentials.enc'), encrypted);

    migrateFromLegacyDir(oldDir, newDir);

    expect(fs.existsSync(path.join(newDir, 'credentials.enc'))).toBe(false);
    expect(fs.existsSync(path.join(oldDir, 'credentials.enc.bak'))).toBe(true);
  });

  it('skips migration when old dir does not exist', () => {
    const missingDir = path.join(os.tmpdir(), 'email-mcp-nonexistent-' + Date.now());
    migrateFromLegacyDir(missingDir, newDir);
    // Should not throw
  });

  it('skips migration when new credentials.enc already exists', () => {
    fs.writeFileSync(path.join(newDir, 'credentials.enc'), 'already-migrated');
    fs.writeFileSync(path.join(oldDir, 'credentials.enc'), 'old-data');

    migrateFromLegacyDir(oldDir, newDir);

    expect(fs.readFileSync(path.join(newDir, 'credentials.enc'), 'utf-8')).toBe('already-migrated');
  });

  it('removes old directory after successful migration', () => {
    const accounts = { accounts: { 'a1': { id: 'a1', name: 'Test', provider: 'gmail', email: 'test@example.com' } } };
    const encrypted = oldEncrypt(JSON.stringify(accounts), os.hostname(), os.userInfo().username);
    fs.writeFileSync(path.join(oldDir, 'credentials.enc'), encrypted);

    migrateFromLegacyDir(oldDir, newDir);

    expect(fs.existsSync(oldDir)).toBe(false);
  });

  it('keeps old directory on partial failure', () => {
    const encrypted = oldEncrypt('{"accounts":{}}', 'wrong-hostname', 'wrong-user');
    fs.writeFileSync(path.join(oldDir, 'credentials.enc'), encrypted);

    migrateFromLegacyDir(oldDir, newDir);

    expect(fs.existsSync(oldDir)).toBe(true);
  });
});
