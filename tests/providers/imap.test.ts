import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImapAdapter } from '../../src/providers/imap/adapter.js';
import { ProviderType } from '../../src/models/types.js';
import type { SearchQuery } from '../../src/models/types.js';

const mockFolders = [
  { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox', status: { messages: 10, unseen: 3 } },
  { path: 'Sent', name: 'Sent', specialUse: '\\Sent', status: { messages: 50, unseen: 0 } },
  { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts', status: { messages: 2, unseen: 0 } },
  { path: 'Trash', name: 'Trash', specialUse: '\\Trash', status: { messages: 5, unseen: 0 } },
  { path: 'Junk', name: 'Junk', specialUse: '\\Junk', status: { messages: 8, unseen: 8 } },
];

function createMockMessage(uid: number, opts: {
  from?: string;
  to?: string;
  subject?: string;
  date?: Date;
  flags?: Set<string>;
  text?: string;
  html?: string;
} = {}) {
  return {
    uid,
    source: Buffer.from(`Subject: ${opts.subject || 'Test'}\r\n\r\n${opts.text || 'body'}`),
    flags: opts.flags || new Set(),
  };
}

function createParsedEmail(uid: number, opts: {
  from?: string;
  to?: string;
  subject?: string;
  date?: Date;
  flags?: Set<string>;
  text?: string;
  html?: string;
} = {}) {
  return {
    uid,
    messageId: `<msg-${uid}@example.com>`,
    from: { value: [{ name: opts.from || 'Alice', address: opts.from || 'alice@test.com' }] },
    to: { value: [{ name: opts.to || 'Bob', address: opts.to || 'bob@test.com' }] },
    subject: opts.subject || `Test Subject ${uid}`,
    date: opts.date || new Date('2026-01-15T10:00:00Z'),
    text: opts.text || `Body of message ${uid}`,
    html: opts.html,
    attachments: [],
    flags: opts.flags || new Set(),
  };
}

let mockSearchResult: number[] = [1, 2, 3];
let mockFetchMessages: any[] = [];
let mockMailboxLockRelease = vi.fn();

// Mock imapflow
vi.mock('imapflow', () => {
  class MockImapFlow {
    connect = vi.fn().mockResolvedValue(undefined);
    logout = vi.fn().mockResolvedValue(undefined);
    list = vi.fn().mockResolvedValue(mockFolders);
    usable = true;

    search = vi.fn().mockImplementation(() => Promise.resolve(mockSearchResult));

    getMailboxLock = vi.fn().mockImplementation(() =>
      Promise.resolve({ release: mockMailboxLockRelease })
    );

    fetch = vi.fn().mockImplementation(function* (uids: number[] | string) {
      const uidSet = Array.isArray(uids) ? new Set(uids) : null;
      for (const msg of mockFetchMessages) {
        if (!uidSet || uidSet.has(msg.uid)) {
          yield msg;
        }
      }
    });

    // Make fetch iterable via fetchAll helper
    fetchOne = vi.fn().mockImplementation(() => {
      return Promise.resolve(mockFetchMessages[0] || null);
    });

    constructor(_config: any) {}
  }
  return { ImapFlow: MockImapFlow };
});

// Mock mailparser
vi.mock('mailparser', () => ({
  simpleParser: vi.fn().mockImplementation(async (source: Buffer) => {
    // Return a mock parsed email based on the source
    const text = source.toString();
    const uidMatch = text.match(/uid-(\d+)/);
    const uid = uidMatch ? parseInt(uidMatch[1]) : 1;
    return createParsedEmail(uid);
  }),
}));

const testCredentials = {
  id: 'test-1',
  name: 'Test',
  provider: 'imap' as const,
  email: 'test@example.com',
  password: {
    password: 'pass123',
    host: 'imap.example.com',
    port: 993,
    tls: true,
  },
};

describe('ImapAdapter', () => {
  let adapter: ImapAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ImapAdapter();
    mockSearchResult = [1, 2, 3];
    mockFetchMessages = [
      createMockMessage(1, { subject: 'First', text: 'uid-1 body' }),
      createMockMessage(2, { subject: 'Second', text: 'uid-2 body' }),
      createMockMessage(3, { subject: 'Third', text: 'uid-3 body' }),
    ];
  });

  it('has correct provider type', () => {
    expect(adapter.providerType).toBe(ProviderType.IMAP);
  });

  it('connects with password credentials', async () => {
    await adapter.connect(testCredentials);

    const result = await adapter.testConnection();
    expect(result.success).toBe(true);
    expect(result.folderCount).toBe(5);
  });

  it('throws if no password credentials provided', async () => {
    await expect(
      adapter.connect({
        id: 'test-2',
        name: 'Test',
        provider: 'imap',
        email: 'test@example.com',
      })
    ).rejects.toThrow('IMAP adapter requires password credentials');
  });

  it('lists folders with correct types', async () => {
    await adapter.connect(testCredentials);

    const folders = await adapter.listFolders();
    expect(folders).toHaveLength(5);

    const inbox = folders.find((f) => f.path === 'INBOX');
    expect(inbox?.type).toBe('inbox');
    expect(inbox?.totalCount).toBe(10);
    expect(inbox?.unreadCount).toBe(3);

    const sent = folders.find((f) => f.path === 'Sent');
    expect(sent?.type).toBe('sent');

    const drafts = folders.find((f) => f.path === 'Drafts');
    expect(drafts?.type).toBe('drafts');

    const trash = folders.find((f) => f.path === 'Trash');
    expect(trash?.type).toBe('trash');

    const spam = folders.find((f) => f.path === 'Junk');
    expect(spam?.type).toBe('spam');
  });

  it('throws when listing folders without connecting', async () => {
    await expect(adapter.listFolders()).rejects.toThrow('Not connected');
  });

  it('disconnects cleanly', async () => {
    await adapter.connect(testCredentials);
    await adapter.disconnect();
    await expect(adapter.listFolders()).rejects.toThrow('Not connected');
  });
});

describe('ImapAdapter search and getEmail', () => {
  let adapter: ImapAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new ImapAdapter();
    mockSearchResult = [1, 2, 3];
    mockFetchMessages = [
      createMockMessage(1, { subject: 'First', text: 'uid-1 body' }),
      createMockMessage(2, { subject: 'Second', text: 'uid-2 body' }),
      createMockMessage(3, { subject: 'Third', text: 'uid-3 body' }),
    ];
    await adapter.connect(testCredentials);
  });

  it('searches messages in a folder', async () => {
    const results = await adapter.search({ folder: 'INBOX' });
    expect(results).toHaveLength(3);
    expect(results[0].accountId).toBe('test-1');
    expect(results[0].folder).toBe('INBOX');
  });

  it('searches with from filter', async () => {
    const results = await adapter.search({ folder: 'INBOX', from: 'alice@test.com' });
    expect(results).toHaveLength(3);
    // Verify the IMAP client's search was called with the right criteria
    const client = (adapter as any).client;
    expect(client.search).toHaveBeenCalled();
    const searchCriteria = client.search.mock.calls[0][0];
    expect(searchCriteria).toHaveProperty('from', 'alice@test.com');
  });

  it('searches with unreadOnly filter', async () => {
    await adapter.search({ folder: 'INBOX', unreadOnly: true });
    const client = (adapter as any).client;
    const searchCriteria = client.search.mock.calls[0][0];
    expect(searchCriteria).toHaveProperty('unseen', true);
  });

  it('searches with date filters', async () => {
    await adapter.search({ folder: 'INBOX', since: '2026-01-01', before: '2026-02-01' });
    const client = (adapter as any).client;
    const searchCriteria = client.search.mock.calls[0][0];
    expect(searchCriteria.since).toBeInstanceOf(Date);
    expect(searchCriteria.before).toBeInstanceOf(Date);
  });

  it('searches with subject filter', async () => {
    await adapter.search({ folder: 'INBOX', subject: 'Test' });
    const client = (adapter as any).client;
    const searchCriteria = client.search.mock.calls[0][0];
    expect(searchCriteria).toHaveProperty('subject', 'Test');
  });

  it('searches with starredOnly filter', async () => {
    await adapter.search({ folder: 'INBOX', starredOnly: true });
    const client = (adapter as any).client;
    const searchCriteria = client.search.mock.calls[0][0];
    expect(searchCriteria).toHaveProperty('flagged', true);
  });

  it('applies limit', async () => {
    const results = await adapter.search({ folder: 'INBOX', limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('applies offset', async () => {
    mockSearchResult = [1, 2, 3, 4, 5];
    mockFetchMessages = [
      createMockMessage(3, { text: 'uid-3 body' }),
      createMockMessage(4, { text: 'uid-4 body' }),
      createMockMessage(5, { text: 'uid-5 body' }),
    ];
    const results = await adapter.search({ folder: 'INBOX', offset: 2 });
    expect(results).toHaveLength(3);
  });

  it('applies limit and offset together', async () => {
    mockSearchResult = [1, 2, 3, 4, 5];
    mockFetchMessages = [
      createMockMessage(3, { text: 'uid-3 body' }),
    ];
    const results = await adapter.search({ folder: 'INBOX', offset: 2, limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('defaults folder to INBOX', async () => {
    const results = await adapter.search({});
    expect(results).toHaveLength(3);
    const client = (adapter as any).client;
    expect(client.getMailboxLock).toHaveBeenCalledWith('INBOX');
  });

  it('getEmail fetches a single message by UID', async () => {
    mockFetchMessages = [
      createMockMessage(42, { subject: 'Single', text: 'uid-42 body' }),
    ];
    const email = await adapter.getEmail('42');
    expect(email.id).toBe('42');
    expect(email.accountId).toBe('test-1');
    expect(email.folder).toBe('INBOX');
  });

  it('getEmail throws if message not found', async () => {
    mockFetchMessages = [];
    const client = (adapter as any).client;
    client.fetchOne.mockResolvedValueOnce(null);
    await expect(adapter.getEmail('999')).rejects.toThrow();
  });

  it('releases mailbox lock after search', async () => {
    await adapter.search({ folder: 'INBOX' });
    expect(mockMailboxLockRelease).toHaveBeenCalled();
  });
});
