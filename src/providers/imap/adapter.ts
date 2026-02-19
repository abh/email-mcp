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
  BatchResult,
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

      if (query.returnBody) {
        // Full fetch with body parsing
        for await (const msg of this.client.fetch(slicedUids, { source: true, uid: true, flags: true })) {
          const parsed = await simpleParser(msg.source);
          (parsed as any).flags = msg.flags;
          emails.push(mapParsedEmail(parsed, folder, this.accountId, msg.uid));
        }
      } else {
        // Lightweight fetch: headers + flags only, skip expensive body parsing
        for await (const msg of this.client.fetch(slicedUids, {
          envelope: true, uid: true, flags: true, bodyStructure: true,
        })) {
          const env = msg.envelope;
          emails.push({
            id: String(msg.uid),
            accountId: this.accountId,
            threadId: env.messageId || undefined,
            folder,
            from: env.from?.[0] ? { name: env.from[0].name || undefined, email: env.from[0].address || '' } : { email: '' },
            to: (env.to || []).map((a: any) => ({ name: a.name || undefined, email: a.address || '' })),
            cc: env.cc?.length ? env.cc.map((a: any) => ({ name: a.name || undefined, email: a.address || '' })) : undefined,
            bcc: env.bcc?.length ? env.bcc.map((a: any) => ({ name: a.name || undefined, email: a.address || '' })) : undefined,
            subject: env.subject || '(no subject)',
            date: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
            body: { text: undefined, html: undefined },
            snippet: env.subject || '',
            attachments: [],
            flags: {
              read: msg.flags?.has('\\Seen') ?? false,
              starred: msg.flags?.has('\\Flagged') ?? false,
              flagged: msg.flags?.has('\\Flagged') ?? false,
              draft: msg.flags?.has('\\Draft') ?? false,
            },
          });
        }
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

  async getThread(threadId: string): Promise<Thread> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock('INBOX');
    try {
      // Search for messages that reference this thread ID via header
      const uids: number[] = await this.client.search(
        { or: [{ header: { 'message-id': threadId } }, { header: { references: threadId } }, { header: { 'in-reply-to': threadId } }] },
        { uid: true }
      );

      if (uids.length === 0) throw new Error(`Thread ${threadId} not found`);

      const messages: Email[] = [];
      for await (const msg of this.client.fetch(uids, { source: true, uid: true, flags: true })) {
        const parsed = await simpleParser(msg.source);
        (parsed as any).flags = msg.flags;
        messages.push(mapParsedEmail(parsed, 'INBOX', this.accountId, msg.uid));
      }

      // Collect unique participants
      const participantMap = new Map<string, { name?: string; email: string }>();
      for (const msg of messages) {
        if (msg.from.email) participantMap.set(msg.from.email, msg.from);
        for (const to of msg.to) {
          if (to.email) participantMap.set(to.email, to);
        }
      }

      // Sort messages by date
      messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return {
        id: threadId,
        subject: messages[0]?.subject || '(no subject)',
        participants: Array.from(participantMap.values()),
        messageCount: messages.length,
        messages,
        lastMessageDate: messages[messages.length - 1]?.date || new Date().toISOString(),
      };
    } finally {
      lock.release();
    }
  }

  async getAttachment(emailId: string, attachmentId: string): Promise<{ data: Buffer; meta: AttachmentMeta }> {
    if (!this.client) throw new Error('Not connected');

    const lock = await this.client.getMailboxLock('INBOX');
    try {
      const msg = await this.client.fetchOne(String(emailId), { source: true, uid: true }, { uid: true });
      if (!msg) throw new Error(`Email ${emailId} not found`);

      const parsed = await simpleParser(msg.source);
      const attachment = (parsed.attachments || []).find(
        (att: any) => att.contentId === attachmentId || att.filename === attachmentId
      );
      if (!attachment) throw new Error(`Attachment ${attachmentId} not found in email ${emailId}`);

      return {
        data: attachment.content,
        meta: {
          id: attachment.contentId || attachmentId,
          filename: attachment.filename || 'attachment',
          contentType: attachment.contentType || 'application/octet-stream',
          size: attachment.size || 0,
        },
      };
    } finally {
      lock.release();
    }
  }

  async sendEmail(params: SendEmailParams): Promise<{ id: string; threadId?: string }> {
    if (!this.passwordCreds) throw new Error('No credentials available');
    const transport = createSmtpTransport(this.email, this.passwordCreds);
    const messageId = await sendViaSmtp(transport, this.email, params);
    return { id: messageId };
  }

  async createDraft(params: SendEmailParams): Promise<{ id: string }> {
    if (!this.client) throw new Error('Not connected');

    // Build RFC 2822 message
    const lines: string[] = [];
    lines.push(`From: ${this.email}`);
    lines.push(`To: ${params.to.map((c) => (c.name ? `"${c.name}" <${c.email}>` : c.email)).join(', ')}`);
    if (params.cc?.length) {
      lines.push(`Cc: ${params.cc.map((c) => c.email).join(', ')}`);
    }
    lines.push(`Subject: ${params.subject}`);
    lines.push(`Date: ${new Date().toUTCString()}`);
    if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
    if (params.references?.length) lines.push(`References: ${params.references.join(' ')}`);
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('');
    lines.push(params.body.text || '');

    const rawMessage = lines.join('\r\n');
    const result = await this.client.append('Drafts', rawMessage, ['\\Draft', '\\Seen']);
    return { id: String(result.uid || result) };
  }

  async listDrafts(limit?: number, offset?: number): Promise<Email[]> {
    return this.search({
      folder: 'Drafts',
      limit,
      offset,
    });
  }

  async moveEmail(emailId: string, targetFolder: string, sourceFolder?: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const lock = await this.client.getMailboxLock(sourceFolder || 'INBOX');
    try {
      await this.client.messageMove(emailId, targetFolder, { uid: true });
    } finally {
      lock.release();
    }
  }

  async deleteEmail(emailId: string, permanent?: boolean, sourceFolder?: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const lock = await this.client.getMailboxLock(sourceFolder || 'INBOX');
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

  async markEmail(emailId: string, flags: { read?: boolean; starred?: boolean; flagged?: boolean }, sourceFolder?: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const lock = await this.client.getMailboxLock(sourceFolder || 'INBOX');
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

  async batchDelete(emailIds: string[], permanent?: boolean, sourceFolder?: string): Promise<BatchResult> {
    if (!this.client) throw new Error('Not connected');
    const result: BatchResult = { succeeded: [], failed: [] };
    const folder = sourceFolder || 'INBOX';
    const lock = await this.client.getMailboxLock(folder);

    try {
      // ImapFlow supports UID ranges as comma-separated strings
      const uidRange = emailIds.join(',');
      if (permanent) {
        await this.client.messageDelete(uidRange, { uid: true });
      } else {
        await this.client.messageMove(uidRange, 'Trash', { uid: true });
      }
      result.succeeded = [...emailIds];
    } catch (error: any) {
      // If batch fails, try individually
      for (const id of emailIds) {
        try {
          if (permanent) {
            await this.client.messageDelete(id, { uid: true });
          } else {
            await this.client.messageMove(id, 'Trash', { uid: true });
          }
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
    } finally {
      lock.release();
    }

    return result;
  }

  async batchMove(emailIds: string[], targetFolder: string, sourceFolder?: string): Promise<BatchResult> {
    if (!this.client) throw new Error('Not connected');
    const result: BatchResult = { succeeded: [], failed: [] };
    const folder = sourceFolder || 'INBOX';
    const lock = await this.client.getMailboxLock(folder);

    try {
      const uidRange = emailIds.join(',');
      await this.client.messageMove(uidRange, targetFolder, { uid: true });
      result.succeeded = [...emailIds];
    } catch (error: any) {
      for (const id of emailIds) {
        try {
          await this.client.messageMove(id, targetFolder, { uid: true });
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
    } finally {
      lock.release();
    }

    return result;
  }

  async batchMark(emailIds: string[], flags: { read?: boolean; starred?: boolean; flagged?: boolean }, sourceFolder?: string): Promise<BatchResult> {
    if (!this.client) throw new Error('Not connected');
    const result: BatchResult = { succeeded: [], failed: [] };
    const folder = sourceFolder || 'INBOX';
    const lock = await this.client.getMailboxLock(folder);

    try {
      const uidRange = emailIds.join(',');

      if (flags.read === true) {
        await this.client.messageFlagsAdd(uidRange, ['\\Seen'], { uid: true });
      } else if (flags.read === false) {
        await this.client.messageFlagsRemove(uidRange, ['\\Seen'], { uid: true });
      }

      if (flags.starred === true || flags.flagged === true) {
        await this.client.messageFlagsAdd(uidRange, ['\\Flagged'], { uid: true });
      } else if (flags.starred === false || flags.flagged === false) {
        await this.client.messageFlagsRemove(uidRange, ['\\Flagged'], { uid: true });
      }

      result.succeeded = [...emailIds];
    } catch (error: any) {
      for (const id of emailIds) {
        try {
          await this.markEmail(id, flags, folder);
          result.succeeded.push(id);
        } catch (e: any) {
          result.failed.push({ id, error: e.message });
        }
      }
    } finally {
      lock.release();
    }

    return result;
  }
}
