import { Client } from '@microsoft/microsoft-graph-client';
import type { EmailProvider, SendEmailParams } from '../provider.js';
import type {
  Email,
  Folder,
  Thread,
  SearchQuery,
  AttachmentMeta,
  AccountCredentials,
  ProviderTypeValue,
} from '../../models/types.js';
import { ProviderType } from '../../models/types.js';
import { mapGraphFolder, mapGraphMessage, mapGraphAttachment, buildGraphFilter } from './mapper.js';

export class OutlookAdapter implements EmailProvider {
  readonly providerType: ProviderTypeValue = ProviderType.Outlook;
  private client: InstanceType<typeof Client> | null = null;
  private accountId: string = '';
  private accessToken: string = '';

  async connect(credentials: AccountCredentials): Promise<void> {
    if (!credentials.oauth) {
      throw new Error('Outlook adapter requires OAuth credentials');
    }
    this.accountId = credentials.id;
    this.accessToken = credentials.oauth.access_token;

    this.client = Client.init({
      authProvider: (done) => {
        done(null, this.accessToken);
      },
    });
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.accessToken = '';
  }

  async testConnection(): Promise<{ success: boolean; folderCount: number; error?: string }> {
    try {
      const folders = await this.listFolders();
      return { success: true, folderCount: folders.length };
    } catch (error: any) {
      return { success: false, folderCount: 0, error: error.message };
    }
  }

  private ensureClient(): InstanceType<typeof Client> {
    if (!this.client) throw new Error('Not connected');
    return this.client;
  }

  async listFolders(): Promise<Folder[]> {
    const client = this.ensureClient();
    const response = await client.api('/me/mailFolders').get();
    return (response.value || []).map(mapGraphFolder);
  }

  async createFolder(name: string, parentPath?: string): Promise<Folder> {
    const client = this.ensureClient();
    const endpoint = parentPath
      ? `/me/mailFolders/${parentPath}/childFolders`
      : '/me/mailFolders';
    const result = await client.api(endpoint).post({ displayName: name });
    return mapGraphFolder(result);
  }

  async search(query: SearchQuery): Promise<Email[]> {
    const client = this.ensureClient();
    const endpoint = query.folder
      ? `/me/mailFolders/${query.folder}/messages`
      : '/me/messages';

    const { filter, search } = buildGraphFilter(query);
    let request = client.api(endpoint);

    if (filter) {
      request = request.filter(filter);
    }
    if (search) {
      request = request.search(search);
    }
    if (query.limit) {
      request = request.top(query.limit);
    }
    if (query.offset) {
      request = request.skip(query.offset);
    }

    request = request.orderby('receivedDateTime desc');

    const response = await request.get();
    return (response.value || []).map((msg: any) => mapGraphMessage(msg, this.accountId));
  }

  async getEmail(id: string): Promise<Email> {
    const client = this.ensureClient();
    const message = await client.api(`/me/messages/${id}`).get();
    const email = mapGraphMessage(message, this.accountId);

    if (message.hasAttachments) {
      const attachments = await client.api(`/me/messages/${id}/attachments`).get();
      email.attachments = (attachments.value || []).map(mapGraphAttachment);
    }

    return email;
  }

  async getThread(threadId: string): Promise<Thread> {
    const client = this.ensureClient();
    const response = await client
      .api('/me/messages')
      .filter(`conversationId eq '${threadId}'`)
      .orderby('receivedDateTime asc')
      .get();

    const messages: Email[] = (response.value || []).map((msg: any) =>
      mapGraphMessage(msg, this.accountId)
    );

    const participantMap = new Map<string, { name?: string; email: string }>();
    for (const msg of messages) {
      participantMap.set(msg.from.email, msg.from);
      for (const to of msg.to) {
        participantMap.set(to.email, to);
      }
    }

    return {
      id: threadId,
      subject: messages[0]?.subject || '',
      participants: Array.from(participantMap.values()),
      messageCount: messages.length,
      messages,
      lastMessageDate: messages[messages.length - 1]?.date || '',
    };
  }

  async getAttachment(
    emailId: string,
    attachmentId: string
  ): Promise<{ data: Buffer; meta: AttachmentMeta }> {
    const client = this.ensureClient();
    const attachment = await client
      .api(`/me/messages/${emailId}/attachments/${attachmentId}`)
      .get();

    return {
      data: Buffer.from(attachment.contentBytes || '', 'base64'),
      meta: mapGraphAttachment(attachment),
    };
  }

  async sendEmail(params: SendEmailParams): Promise<{ id: string; threadId?: string }> {
    const client = this.ensureClient();
    const message = this.buildGraphMessage(params);

    const payload: any = { message };
    if (params.attachments?.length) {
      payload.message.attachments = params.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType,
        contentBytes: att.content.toString('base64'),
      }));
    }

    await client.api('/me/sendMail').post(payload);

    return { id: `sent-${Date.now()}` };
  }

  async createDraft(params: SendEmailParams): Promise<{ id: string }> {
    const client = this.ensureClient();
    const message = this.buildGraphMessage(params);

    const result = await client.api('/me/messages').post(message);
    return { id: result.id };
  }

  async listDrafts(limit?: number, offset?: number): Promise<Email[]> {
    const client = this.ensureClient();
    let request = client.api('/me/mailFolders/drafts/messages');

    if (limit !== undefined) {
      request = request.top(limit);
    }
    if (offset !== undefined) {
      request = request.skip(offset);
    }

    request = request.orderby('receivedDateTime desc');

    const response = await request.get();
    return (response.value || []).map((msg: any) => mapGraphMessage(msg, this.accountId));
  }

  async moveEmail(emailId: string, targetFolder: string): Promise<void> {
    const client = this.ensureClient();
    await client.api(`/me/messages/${emailId}/move`).post({
      destinationId: targetFolder,
    });
  }

  async deleteEmail(emailId: string, permanent?: boolean): Promise<void> {
    const client = this.ensureClient();
    if (permanent) {
      await client.api(`/me/messages/${emailId}`).delete();
    } else {
      await client.api(`/me/messages/${emailId}/move`).post({
        destinationId: 'deleteditems',
      });
    }
  }

  async markEmail(
    emailId: string,
    flags: { read?: boolean; starred?: boolean; flagged?: boolean }
  ): Promise<void> {
    const client = this.ensureClient();
    const patch: any = {};

    if (flags.read !== undefined) {
      patch.isRead = flags.read;
    }
    if (flags.starred !== undefined) {
      patch.importance = flags.starred ? 'high' : 'normal';
    }
    if (flags.flagged !== undefined) {
      patch.flag = { flagStatus: flags.flagged ? 'flagged' : 'notFlagged' };
    }

    await client.api(`/me/messages/${emailId}`).patch(patch);
  }

  async getCategories(): Promise<string[]> {
    const client = this.ensureClient();
    const response = await client.api('/me/outlook/masterCategories').get();
    return (response.value || []).map((cat: any) => cat.displayName);
  }

  private buildGraphMessage(params: SendEmailParams): any {
    const toGraphRecipient = (contact: { name?: string; email: string }) => ({
      emailAddress: { name: contact.name, address: contact.email },
    });

    const bodyContent = params.body.html || params.body.text || '';
    const contentType = params.body.html ? 'html' : 'text';

    const message: any = {
      subject: params.subject,
      body: { contentType, content: bodyContent },
      toRecipients: params.to.map(toGraphRecipient),
    };

    if (params.cc?.length) {
      message.ccRecipients = params.cc.map(toGraphRecipient);
    }
    if (params.bcc?.length) {
      message.bccRecipients = params.bcc.map(toGraphRecipient);
    }

    return message;
  }
}
