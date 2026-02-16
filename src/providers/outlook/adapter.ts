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

  // Methods to be fully implemented in Task 15
  async sendEmail(_params: SendEmailParams): Promise<{ id: string; threadId?: string }> {
    throw new Error('Not implemented yet');
  }

  async createDraft(_params: SendEmailParams): Promise<{ id: string }> {
    throw new Error('Not implemented yet');
  }

  async listDrafts(_limit?: number, _offset?: number): Promise<Email[]> {
    throw new Error('Not implemented yet');
  }

  async moveEmail(_emailId: string, _targetFolder: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async deleteEmail(_emailId: string, _permanent?: boolean): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async markEmail(
    _emailId: string,
    _flags: { read?: boolean; starred?: boolean; flagged?: boolean }
  ): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async getCategories(): Promise<string[]> {
    throw new Error('Not implemented yet');
  }
}
