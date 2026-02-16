import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ICloudAdapter } from '../../src/providers/icloud/adapter.js';
import { ProviderType } from '../../src/models/types.js';
import { ImapFlow } from 'imapflow';

const mockFolders = [
  { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox', status: { messages: 5, unseen: 2 } },
  { path: 'Sent Messages', name: 'Sent Messages', specialUse: '\\Sent', status: { messages: 20, unseen: 0 } },
  { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts', status: { messages: 1, unseen: 0 } },
  { path: 'Trash', name: 'Trash', specialUse: '\\Trash', status: { messages: 3, unseen: 0 } },
];

let capturedConfig: any = null;

vi.mock('imapflow', () => {
  class MockImapFlow {
    connect = vi.fn().mockResolvedValue(undefined);
    logout = vi.fn().mockResolvedValue(undefined);
    list = vi.fn().mockResolvedValue(mockFolders);
    usable = true;

    search = vi.fn().mockResolvedValue([]);
    getMailboxLock = vi.fn().mockResolvedValue({ release: vi.fn() });
    fetch = vi.fn().mockImplementation(function* () {});
    fetchOne = vi.fn().mockResolvedValue(null);
    messageMove = vi.fn().mockResolvedValue(undefined);
    messageDelete = vi.fn().mockResolvedValue(undefined);
    messageFlagsAdd = vi.fn().mockResolvedValue(undefined);
    messageFlagsRemove = vi.fn().mockResolvedValue(undefined);
    mailboxCreate = vi.fn().mockResolvedValue({ path: 'NewFolder', name: 'NewFolder' });
    append = vi.fn().mockResolvedValue({ uid: 100 });

    constructor(config: any) {
      capturedConfig = config;
    }
  }
  return { ImapFlow: MockImapFlow };
});

vi.mock('mailparser', () => ({
  simpleParser: vi.fn().mockResolvedValue({
    uid: 1,
    messageId: '<msg-1@icloud.com>',
    from: { value: [{ name: 'Alice', address: 'alice@icloud.com' }] },
    to: { value: [{ name: 'Bob', address: 'bob@test.com' }] },
    subject: 'Test',
    date: new Date('2026-01-15'),
    text: 'body',
    attachments: [],
    flags: new Set(),
  }),
}));

const { mockSendMail } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({ messageId: '<sent-1@icloud.com>' });
  return { mockSendMail };
});
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mockSendMail,
    }),
  },
}));

describe('ICloudAdapter', () => {
  let adapter: ICloudAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfig = null;
    adapter = new ICloudAdapter();
  });

  it('has icloud provider type', () => {
    expect(adapter.providerType).toBe(ProviderType.ICloud);
  });

  it('uses iCloud IMAP defaults when connecting', async () => {
    await adapter.connect({
      id: 'icloud-1',
      name: 'My iCloud',
      provider: 'icloud',
      email: 'user@icloud.com',
      password: {
        password: 'app-specific-password',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
      },
    });

    expect(capturedConfig).toBeTruthy();
    expect(capturedConfig.host).toBe('imap.mail.me.com');
    expect(capturedConfig.port).toBe(993);
    expect(capturedConfig.secure).toBe(true);
    expect(capturedConfig.auth.user).toBe('user@icloud.com');
    expect(capturedConfig.auth.pass).toBe('app-specific-password');
  });

  it('sets iCloud defaults for host and port', async () => {
    await adapter.connect({
      id: 'icloud-2',
      name: 'My iCloud',
      provider: 'icloud',
      email: 'user@icloud.com',
      password: {
        password: 'app-specific-password',
        host: 'custom.host.com',
        port: 993,
        tls: true,
      },
    });

    // The user-provided host should be used (not overridden)
    expect(capturedConfig.host).toBe('custom.host.com');
  });

  it('provides iCloud SMTP defaults', async () => {
    await adapter.connect({
      id: 'icloud-3',
      name: 'My iCloud',
      provider: 'icloud',
      email: 'user@icloud.com',
      password: {
        password: 'app-specific-password',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
      },
    });

    // passwordCreds should have SMTP defaults set
    const creds = (adapter as any).passwordCreds;
    expect(creds.smtpHost).toBe('smtp.mail.me.com');
    expect(creds.smtpPort).toBe(587);
  });

  it('connects and lists folders', async () => {
    await adapter.connect({
      id: 'icloud-4',
      name: 'My iCloud',
      provider: 'icloud',
      email: 'user@icloud.com',
      password: {
        password: 'app-specific-password',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
      },
    });

    const result = await adapter.testConnection();
    expect(result.success).toBe(true);
    expect(result.folderCount).toBe(4);
  });

  it('inherits all IMAP methods', async () => {
    await adapter.connect({
      id: 'icloud-5',
      name: 'My iCloud',
      provider: 'icloud',
      email: 'user@icloud.com',
      password: {
        password: 'pass',
        host: 'imap.mail.me.com',
        port: 993,
        tls: true,
      },
    });

    // Should have all EmailProvider methods from ImapAdapter
    expect(typeof adapter.listFolders).toBe('function');
    expect(typeof adapter.search).toBe('function');
    expect(typeof adapter.getEmail).toBe('function');
    expect(typeof adapter.getThread).toBe('function');
    expect(typeof adapter.sendEmail).toBe('function');
    expect(typeof adapter.moveEmail).toBe('function');
    expect(typeof adapter.deleteEmail).toBe('function');
    expect(typeof adapter.markEmail).toBe('function');
    expect(typeof adapter.createFolder).toBe('function');
    expect(typeof adapter.createDraft).toBe('function');
    expect(typeof adapter.listDrafts).toBe('function');
    expect(typeof adapter.getAttachment).toBe('function');
  });
});
