import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CredentialStore } from '../../src/auth/credential-store.js';
import { resetKeyCache } from '../../src/auth/key-store.js';
import { ProviderType } from '../../src/models/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('CredentialStore', () => {
  let store: CredentialStore;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-mcp-test-'));
    store = new CredentialStore(testDir);
  });

  afterEach(() => {
    resetKeyCache();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('saves and loads an account', async () => {
    const creds = {
      id: 'test-1',
      name: 'Test Gmail',
      provider: ProviderType.Gmail as const,
      email: 'test@gmail.com',
      oauth: {
        access_token: 'at-123',
        refresh_token: 'rt-456',
        expiry: '2026-12-31T00:00:00Z',
      },
    };

    await store.save(creds);
    const loaded = await store.get('test-1');
    expect(loaded).toEqual(creds);
  });

  it('lists all accounts', async () => {
    await store.save({
      id: 'a1',
      name: 'Gmail',
      provider: ProviderType.Gmail as const,
      email: 'a@gmail.com',
      oauth: { access_token: 'x', refresh_token: 'y', expiry: '' },
    });
    await store.save({
      id: 'a2',
      name: 'iCloud',
      provider: ProviderType.ICloud as const,
      email: 'b@icloud.com',
      password: { password: 'p', host: 'imap.mail.me.com', port: 993, tls: true },
    });

    const accounts = await store.list();
    expect(accounts).toHaveLength(2);
    expect(accounts.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('removes an account', async () => {
    await store.save({
      id: 'del-1',
      name: 'ToDelete',
      provider: ProviderType.IMAP as const,
      email: 'x@test.com',
      password: { password: 'p', host: 'imap.test.com', port: 993, tls: true },
    });

    await store.remove('del-1');
    const loaded = await store.get('del-1');
    expect(loaded).toBeNull();
  });

  it('returns null for nonexistent account', async () => {
    const loaded = await store.get('nope');
    expect(loaded).toBeNull();
  });

  it('persists across instances', async () => {
    await store.save({
      id: 'persist-1',
      name: 'Persist',
      provider: ProviderType.Gmail as const,
      email: 'p@gmail.com',
      oauth: { access_token: 'a', refresh_token: 'r', expiry: '' },
    });

    const store2 = new CredentialStore(testDir);
    const loaded = await store2.get('persist-1');
    expect(loaded?.email).toBe('p@gmail.com');
  });

  it('encrypts the file on disk', async () => {
    await store.save({
      id: 'enc-1',
      name: 'Encrypted',
      provider: ProviderType.Gmail as const,
      email: 'enc@gmail.com',
      oauth: { access_token: 'secret-token', refresh_token: 'secret-refresh', expiry: '' },
    });

    const filePath = path.join(testDir, 'credentials.enc');
    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('secret-token');
    expect(raw).not.toContain('secret-refresh');
  });

  it('updates an existing account', async () => {
    const creds = {
      id: 'upd-1',
      name: 'Original',
      provider: ProviderType.Gmail as const,
      email: 'u@gmail.com',
      oauth: { access_token: 'old', refresh_token: 'r', expiry: '' },
    };
    await store.save(creds);
    await store.save({ ...creds, name: 'Updated', oauth: { access_token: 'new', refresh_token: 'r', expiry: '' } });

    const loaded = await store.get('upd-1');
    expect(loaded?.name).toBe('Updated');
    expect(loaded?.oauth?.access_token).toBe('new');

    const all = await store.list();
    expect(all).toHaveLength(1);
  });

  it('backs up and returns empty on corrupt credentials file', async () => {
    const filePath = path.join(testDir, 'credentials.enc');
    fs.writeFileSync(filePath, 'corrupt-data', { mode: 0o600 });

    const loaded = await store.list();
    expect(loaded).toEqual([]);
    expect(fs.existsSync(filePath + '.bak')).toBe(true);
    expect(fs.readFileSync(filePath + '.bak', 'utf-8')).toBe('corrupt-data');
  });

  it('two stores with different keys cannot read each other', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'email-mcp-test2-'));
    try {
      await store.save({
        id: 'iso-1',
        name: 'Isolated',
        provider: ProviderType.Gmail as const,
        email: 'iso@example.com',
        oauth: { access_token: 'a', refresh_token: 'r', expiry: '' },
      });

      // Copy the credentials file to dir2 (different key)
      resetKeyCache();
      const store2 = new CredentialStore(dir2);
      fs.copyFileSync(
        path.join(testDir, 'credentials.enc'),
        path.join(dir2, 'credentials.enc'),
      );

      // store2 can't decrypt it — gets empty result and creates backup
      const loaded = await store2.list();
      expect(loaded).toEqual([]);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });
});
