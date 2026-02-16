import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImapAdapter } from '../../src/providers/imap/adapter.js';
import { ProviderType } from '../../src/models/types.js';

// Mock imapflow
vi.mock('imapflow', () => {
  class MockImapFlow {
    connect = vi.fn().mockResolvedValue(undefined);
    logout = vi.fn().mockResolvedValue(undefined);
    list = vi.fn().mockResolvedValue([
      { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox', status: { messages: 10, unseen: 3 } },
      { path: 'Sent', name: 'Sent', specialUse: '\\Sent', status: { messages: 50, unseen: 0 } },
      { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts', status: { messages: 2, unseen: 0 } },
      { path: 'Trash', name: 'Trash', specialUse: '\\Trash', status: { messages: 5, unseen: 0 } },
      { path: 'Junk', name: 'Junk', specialUse: '\\Junk', status: { messages: 8, unseen: 8 } },
    ]);
    usable = true;
    constructor(_config: any) {}
  }
  return { ImapFlow: MockImapFlow };
});

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
    adapter = new ImapAdapter();
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

  it('stubs unimplemented methods', async () => {
    await adapter.connect(testCredentials);
    await expect(adapter.createFolder('test')).rejects.toThrow('Not implemented yet');
    await expect(adapter.search({})).rejects.toThrow('Not implemented yet');
    await expect(adapter.getEmail('1')).rejects.toThrow('Not implemented yet');
    await expect(adapter.getThread('1')).rejects.toThrow('Not implemented yet');
    await expect(adapter.getAttachment('1', '1')).rejects.toThrow('Not implemented yet');
    await expect(adapter.sendEmail({ to: [], subject: '', body: {} })).rejects.toThrow('Not implemented yet');
    await expect(adapter.createDraft({ to: [], subject: '', body: {} })).rejects.toThrow('Not implemented yet');
    await expect(adapter.listDrafts()).rejects.toThrow('Not implemented yet');
    await expect(adapter.moveEmail('1', 'Trash')).rejects.toThrow('Not implemented yet');
    await expect(adapter.deleteEmail('1')).rejects.toThrow('Not implemented yet');
    await expect(adapter.markEmail('1', { read: true })).rejects.toThrow('Not implemented yet');
  });
});
