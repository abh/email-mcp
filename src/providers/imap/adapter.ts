import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { EmailProvider, SendEmailParams } from '../provider.js';
import type {
  Email,
  Folder,
  Thread,
  SearchQuery,
  AttachmentMeta,
  AccountCredentials,
  ProviderTypeValue,
  PasswordCredentials,
} from '../../models/types.js';
import { ProviderType, FolderType } from '../../models/types.js';
import { mapImapFolder, mapParsedEmail } from './mapper.js';
import { createSmtpTransport, sendViaSmtp } from './smtp.js';

export class ImapAdapter implements EmailProvider {
  readonly providerType: ProviderTypeValue = ProviderType.IMAP;
  protected client: InstanceType<typeof ImapFlow> | null = null;
  protected accountId: string = '';
  protected email: string = '';
  protected passwordCreds: PasswordCredentials | null = null;

  async connect(credentials: AccountCredentials): Promise<void> {
    if (!credentials.password) {
      throw new Error('IMAP adapter requires password credentials');
    }
    this.accountId = credentials.id;
    this.email = credentials.email;
    this.passwordCreds = credentials.password;

    this.client = new ImapFlow({
      host: credentials.password.host,
      port: credentials.password.port,
      secure: credentials.password.tls,
      auth: {
        user: credentials.email,
        pass: credentials.password.password,
      },
      logger: false,
    });

    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
    }
  }

  async testConnection(): Promise<{ success: boolean; folderCount: number; error?: string }> {
    try {
      const folders = await this.listFolders();
      return { success: true, folderCount: folders.length };
    } catch (error: any) {
      return { success: false, folderCount: 0, error: error.message };
    }
  }

  async listFolders(): Promise<Folder[]> {
    if (!this.client) throw new Error('Not connected');
    const imapFolders = await this.client.list();
    return imapFolders.map(mapImapFolder);
  }

  async createFolder(name: string, parentPath?: string): Promise<Folder> {
    if (!this.client) throw new Error('Not connected');
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    const result = await this.client.mailboxCreate(fullPath);
    return {
      id: result.path,
      name: result.name || name,
      path: result.path,
      type: FolderType.Other,
    };
  }

  protected buildSearchCriteria(query: SearchQuery): Record<string, any> {
    const criteria: Record<string, any> = {};
    if (query.from) criteria.from = query.from;
    if (query.to) criteria.to = query.to;
    if (query.subject) criteria.subject = query.subject;
    if (query.body) criteria.body = query.body;
    if (query.since) criteria.since = new Date(query.since);
    if (query.before) criteria.before = new Date(query.before);
    if (query.unreadOnly) criteria.unseen = true;
    if (query.starredOnly) criteria.flagged = true;
    if (query.hasAttachment) criteria.header = { 'content-type': 'multipart/mixed' };
    return criteria;
  }

  async search(query: SearchQuery): Promise<Email[]> {
    if (!this.client) throw new Error('Not connected');

    const folder = query.folder || 'INBOX';
    const lock = await this.client.getMailboxLock(folder);

    try {
      const criteria = this.buildSearchCriteria(query);
      const allUids: number[] = await this.client.search(
        Object.keys(criteria).length > 0 ? criteria : { all: true },
        { uid: true }
      );

      // Apply offset and limit to the UID list
      const offset = query.offset || 0;
      const slicedUids = query.limit
        ? allUids.slice(offset, offset + query.limit)
        : allUids.slice(offset);

      if (slicedUids.length === 0) return [];

      const emails: Email[] = [];
      for await (const msg of this.client.fetch(slicedUids, { source: true, uid: true, flags: true })) {
        const parsed = await simpleParser(msg.source);
        (parsed as any).flags = msg.flags;
        emails.push(mapParsedEmail(parsed, folder, this.accountId, msg.uid));
      }

      return emails;
    } finally {
      lock.release();
    }
  }

  async getEmail(id: string, folder?: string): Promise<Email> {
    if (!this.client) throw new Error('Not connected');

    const targetFolder = folder || 'INBOX';
    const lock = await this.client.getMailboxLock(targetFolder);

    try {
      const uid = parseInt(id, 10);
      const msg = await this.client.fetchOne(String(uid), { source: true, uid: true, flags: true }, { uid: true });
      if (!msg) throw new Error(`Email ${id} not found`);

      const parsed = await simpleParser(msg.source);
      (parsed as any).flags = msg.flags;
      return mapParsedEmail(parsed, targetFolder, this.accountId, msg.uid);
    } finally {
      lock.release();
    }
  }

  async getThread(_threadId: string): Promise<Thread> {
    throw new Error('Not implemented yet');
  }

  async getAttachment(_emailId: string, _attachmentId: string): Promise<{ data: Buffer; meta: AttachmentMeta }> {
    throw new Error('Not implemented yet');
  }

  async sendEmail(params: SendEmailParams): Promise<{ id: string; threadId?: string }> {
    if (!this.passwordCreds) throw new Error('No credentials available');
    const transport = createSmtpTransport(this.email, this.passwordCreds);
    const messageId = await sendViaSmtp(transport, this.email, params);
    return { id: messageId };
  }

  async createDraft(_params: SendEmailParams): Promise<{ id: string }> {
    throw new Error('Not implemented yet');
  }

  async listDrafts(_limit?: number, _offset?: number): Promise<Email[]> {
    throw new Error('Not implemented yet');
  }

  async moveEmail(emailId: string, targetFolder: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      await this.client.messageMove(emailId, targetFolder, { uid: true });
    } finally {
      lock.release();
    }
  }

  async deleteEmail(emailId: string, permanent?: boolean): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      if (permanent) {
        await this.client.messageDelete(emailId, { uid: true });
      } else {
        await this.client.messageMove(emailId, 'Trash', { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  async markEmail(emailId: string, flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      if (flags.read === true) {
        await this.client.messageFlagsAdd(emailId, ['\\Seen'], { uid: true });
      } else if (flags.read === false) {
        await this.client.messageFlagsRemove(emailId, ['\\Seen'], { uid: true });
      }

      if (flags.starred === true || flags.flagged === true) {
        await this.client.messageFlagsAdd(emailId, ['\\Flagged'], { uid: true });
      } else if (flags.starred === false || flags.flagged === false) {
        await this.client.messageFlagsRemove(emailId, ['\\Flagged'], { uid: true });
      }
    } finally {
      lock.release();
    }
  }
}
