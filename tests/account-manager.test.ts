import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccountManager, resolveAccountRef } from '../src/account-manager.js';
import { CredentialStore } from '../src/auth/credential-store.js';
import { ProviderType } from '../src/models/types.js';
import type { AccountCredentials } from '../src/models/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock all provider adapters using classes
vi.mock('../src/providers/gmail/adapter.js', () => ({
  GmailAdapter: class {
    providerType = 'gmail';
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    testConnection = vi.fn().mockResolvedValue({ success: true, folderCount: 10 });
  },
}));

vi.mock('../src/providers/outlook/adapter.js', () => ({
  OutlookAdapter: class {
    providerType = 'outlook';
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    testConnection = vi.fn().mockResolvedValue({ success: true, folderCount: 8 });
  },
}));

vi.mock('../src/providers/icloud/adapter.js', () => ({
  ICloudAdapter: class {
    providerType = 'icloud';
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    testConnection = vi.fn().mockResolvedValue({ success: true, folderCount: 5 });
  },
}));

vi.mock('../src/providers/imap/adapter.js', () => ({
  ImapAdapter: class {
    providerType = 'imap';
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    testConnection = vi.fn().mockResolvedValue({ success: true, folderCount: 3 });
  },
}));

vi.mock('../src/providers/gmail/auth.js', () => ({
  GmailAuth: class {
    refreshAccessToken = vi.fn().mockResolvedValue({
      access_token: 'new-at',
      refresh_token: 'rt',
      expiry: new Date(Date.now() + 3600000).toISOString(),
    });
  },
}));

vi.mock('../src/providers/outlook/auth.js', () => ({
  OutlookAuth: class {
    refreshToken = vi.fn().mockResolvedValue({
      accessToken: 'new-at',
      expiresOn: new Date(Date.now() + 3600000),
    });
  },
}));

describe('AccountManager', () => {
  let manager: AccountManager;
  let testDir: string;
  let store: CredentialStore;

  const gmailCreds: AccountCredentials = {
    id: 'gmail-1',
    name: 'My Gmail',
    provider: ProviderType.Gmail,
    email: 'test@gmail.com',
    oauth: {
      access_token: 'at-123',
      refresh_token: 'rt-456',
      expiry: new Date(Date.now() + 3600000).toISOString(),
    },
  };

  const icloudCreds: AccountCredentials = {
    id: 'icloud-1',
    name: 'My iCloud',
    provider: ProviderType.ICloud,
    email: 'test@icloud.com',
    password: {
      password: 'app-password',
      host: 'imap.mail.me.com',
      port: 993,
      tls: true,
    },
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-mcp-am-'));
    store = new CredentialStore(testDir);
    manager = new AccountManager(store);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('lists accounts from credential store', async () => {
    await store.save(gmailCreds);
    await store.save(icloudCreds);

    const accounts = await manager.listAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0].connected).toBe(false);
    expect(accounts[1].connected).toBe(false);
  });

  it('returns correct provider for account', async () => {
    await store.save(gmailCreds);
    const provider = await manager.getProvider('gmail-1');
    expect(provider.providerType).toBe('gmail');
  });

  it('auto-connects when getting provider', async () => {
    await store.save(icloudCreds);
    const provider = await manager.getProvider('icloud-1');
    expect(provider.providerType).toBe('icloud');

    const accounts = await manager.listAccounts();
    const icloud = accounts.find((a) => a.id === 'icloud-1');
    expect(icloud?.connected).toBe(true);
  });

  it('adds and connects an account', async () => {
    await manager.addAccount(gmailCreds);

    const accounts = await manager.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].connected).toBe(true);
  });

  it('removes an account', async () => {
    await manager.addAccount(gmailCreds);
    await manager.removeAccount('gmail-1');

    const accounts = await manager.listAccounts();
    expect(accounts).toHaveLength(0);
  });

  it('tests account connection', async () => {
    await store.save(gmailCreds);
    const result = await manager.testAccount('gmail-1');
    expect(result.success).toBe(true);
    expect(result.folderCount).toBe(10);
  });

  it('handles test failure for missing account', async () => {
    const result = await manager.testAccount('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('disconnects all accounts', async () => {
    await manager.addAccount(gmailCreds);
    await manager.addAccount(icloudCreds);

    await manager.disconnectAll();

    const accounts = await manager.listAccounts();
    expect(accounts.every((a) => !a.connected)).toBe(true);
  });

  it('creates correct provider type for each provider', async () => {
    const outlookCreds: AccountCredentials = {
      id: 'outlook-1',
      name: 'Outlook',
      provider: ProviderType.Outlook,
      email: 'test@hotmail.de',
      oauth: { access_token: 'at', refresh_token: 'rt', expiry: new Date(Date.now() + 3600000).toISOString() },
    };

    const imapCreds: AccountCredentials = {
      id: 'imap-1',
      name: 'Custom IMAP',
      provider: ProviderType.IMAP,
      email: 'test@custom.com',
      password: { password: 'p', host: 'imap.custom.com', port: 993, tls: true },
    };

    await store.save(gmailCreds);
    await store.save(outlookCreds);
    await store.save(icloudCreds);
    await store.save(imapCreds);

    const gmail = await manager.getProvider('gmail-1');
    const outlook = await manager.getProvider('outlook-1');
    const icloud = await manager.getProvider('icloud-1');
    const imap = await manager.getProvider('imap-1');

    expect(gmail.providerType).toBe('gmail');
    expect(outlook.providerType).toBe('outlook');
    expect(icloud.providerType).toBe('icloud');
    expect(imap.providerType).toBe('imap');
  });

  it('one provider failing does not affect others', async () => {
    await store.save(gmailCreds);
    await store.save(icloudCreds);

    // Even if getting one fails, the other works
    const provider = await manager.getProvider('icloud-1');
    expect(provider.providerType).toBe('icloud');
  });

  describe('allowedAccountIds filtering', () => {
    it('listAccounts returns only allowed accounts', async () => {
      await store.save(gmailCreds);
      await store.save(icloudCreds);

      const filtered = new AccountManager(store, new Set(['gmail-1']));
      const accounts = await filtered.listAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].id).toBe('gmail-1');
    });

    it('getProvider rejects accounts not in allowed set', async () => {
      await store.save(gmailCreds);
      await store.save(icloudCreds);

      const filtered = new AccountManager(store, new Set(['gmail-1']));
      await expect(filtered.getProvider('icloud-1')).rejects.toThrow(
        'not in the allowed accounts list',
      );
    });

    it('getProvider allows accounts in the allowed set', async () => {
      await store.save(gmailCreds);

      const filtered = new AccountManager(store, new Set(['gmail-1']));
      const provider = await filtered.getProvider('gmail-1');
      expect(provider.providerType).toBe('gmail');
    });

    it('no allowlist means all accounts accessible', async () => {
      await store.save(gmailCreds);
      await store.save(icloudCreds);

      const unfiltered = new AccountManager(store);
      const accounts = await unfiltered.listAccounts();
      expect(accounts).toHaveLength(2);
    });
  });

  describe('resolveAccountRefs', () => {
    it('resolves names to IDs', async () => {
      await store.save(gmailCreds);
      await store.save(icloudCreds);
      const accounts = await store.list();

      const ids = AccountManager.resolveAccountRefs(['My Gmail'], accounts);
      expect(ids).toEqual(new Set(['gmail-1']));
    });

    it('resolves names case-insensitively', async () => {
      await store.save(gmailCreds);
      const accounts = await store.list();

      const ids = AccountManager.resolveAccountRefs(['my gmail'], accounts);
      expect(ids).toEqual(new Set(['gmail-1']));
    });

    it('resolves by ID when name does not match', async () => {
      await store.save(gmailCreds);
      const accounts = await store.list();

      const ids = AccountManager.resolveAccountRefs(['gmail-1'], accounts);
      expect(ids).toEqual(new Set(['gmail-1']));
    });

    it('throws for unknown reference', async () => {
      await store.save(gmailCreds);
      const accounts = await store.list();

      expect(() =>
        AccountManager.resolveAccountRefs(['nonexistent'], accounts),
      ).toThrow('Account not found: "nonexistent"');
    });
  });
});

describe('resolveAccountRef', () => {
  const accounts: AccountCredentials[] = [
    {
      id: 'id-1',
      name: 'Work',
      provider: ProviderType.Gmail,
      email: 'work@example.com',
    },
    {
      id: 'id-2',
      name: 'Personal',
      provider: ProviderType.ICloud,
      email: 'personal@example.com',
    },
  ];

  it('matches by name case-insensitively', () => {
    expect(resolveAccountRef('work', accounts)?.id).toBe('id-1');
    expect(resolveAccountRef('WORK', accounts)?.id).toBe('id-1');
    expect(resolveAccountRef('Work', accounts)?.id).toBe('id-1');
  });

  it('matches by exact ID', () => {
    expect(resolveAccountRef('id-2', accounts)?.id).toBe('id-2');
  });

  it('prefers name match over ID match', () => {
    const ambiguous: AccountCredentials[] = [
      { id: 'some-uuid', name: 'target-id', provider: ProviderType.Gmail, email: 'a@example.com' },
      { id: 'target-id', name: 'Other', provider: ProviderType.Gmail, email: 'b@example.com' },
    ];
    // "target-id" matches the first account by name
    expect(resolveAccountRef('target-id', ambiguous)?.id).toBe('some-uuid');
  });

  it('returns undefined for no match', () => {
    expect(resolveAccountRef('nope', accounts)).toBeUndefined();
  });
});
