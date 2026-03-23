import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('getConfigDir', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    delete process.env.XDG_CONFIG_HOME;
  });

  it('returns ~/Library/Application Support/email-mcp on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const { getConfigDir } = await import('../../src/auth/key-store.js');
    const result = getConfigDir();
    expect(result).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'email-mcp'));
  });

  it('returns ~/.config/email-mcp on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.XDG_CONFIG_HOME;
    const { getConfigDir } = await import('../../src/auth/key-store.js');
    const result = getConfigDir();
    expect(result).toBe(path.join(os.homedir(), '.config', 'email-mcp'));
  });

  it('respects XDG_CONFIG_HOME on Linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_CONFIG_HOME = '/tmp/custom-config';
    const { getConfigDir } = await import('../../src/auth/key-store.js');
    const result = getConfigDir();
    expect(result).toBe('/tmp/custom-config/email-mcp');
  });

  it('throws on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { getConfigDir } = await import('../../src/auth/key-store.js');
    expect(() => getConfigDir()).toThrow('Platform "win32" is not yet supported by email-mcp');
  });
});

describe('getOrCreateEncryptionKey', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-mcp-keytest-'));
    const { resetKeyCache } = await import('../../src/auth/key-store.js');
    resetKeyCache();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates a 32-byte key on first call', async () => {
    const { getOrCreateEncryptionKey } = await import('../../src/auth/key-store.js');
    const key = getOrCreateEncryptionKey(testDir);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('persists the key to a file', async () => {
    const { getOrCreateEncryptionKey } = await import('../../src/auth/key-store.js');
    getOrCreateEncryptionKey(testDir);
    const keyFile = path.join(testDir, 'encryption.key');
    expect(fs.existsSync(keyFile)).toBe(true);
    const hex = fs.readFileSync(keyFile, 'utf-8');
    expect(Buffer.from(hex, 'hex').length).toBe(32);
  });

  it('returns the same key on subsequent calls', async () => {
    const { getOrCreateEncryptionKey, resetKeyCache } = await import('../../src/auth/key-store.js');
    const key1 = getOrCreateEncryptionKey(testDir);
    resetKeyCache();
    const key2 = getOrCreateEncryptionKey(testDir);
    expect(key1.equals(key2)).toBe(true);
  });

  it('rejects a corrupt key file', async () => {
    const { getOrCreateEncryptionKey, resetKeyCache } = await import('../../src/auth/key-store.js');
    const keyFile = path.join(testDir, 'encryption.key');
    fs.writeFileSync(keyFile, 'not-valid-hex-zzzz', { mode: 0o600 });
    resetKeyCache();
    expect(() => getOrCreateEncryptionKey(testDir)).toThrow();
  });

  it('rejects a truncated key file', async () => {
    const { getOrCreateEncryptionKey, resetKeyCache } = await import('../../src/auth/key-store.js');
    const keyFile = path.join(testDir, 'encryption.key');
    // Only 16 bytes instead of 32
    fs.writeFileSync(keyFile, 'aa'.repeat(16), { mode: 0o600 });
    resetKeyCache();
    expect(() => getOrCreateEncryptionKey(testDir)).toThrow();
  });

  it('sets restrictive file permissions (0o600)', async () => {
    const { getOrCreateEncryptionKey } = await import('../../src/auth/key-store.js');
    getOrCreateEncryptionKey(testDir);
    const keyFile = path.join(testDir, 'encryption.key');
    const stats = fs.statSync(keyFile);
    // eslint-disable-next-line no-bitwise
    const mode = stats.mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
