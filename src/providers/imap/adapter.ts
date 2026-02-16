import { ImapFlow } from 'imapflow';
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
import { ProviderType } from '../../models/types.js';
import { mapImapFolder } from './mapper.js';

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

  async createFolder(_name: string, _parentPath?: string): Promise<Folder> {
    throw new Error('Not implemented yet');
  }

  async search(_query: SearchQuery): Promise<Email[]> {
    throw new Error('Not implemented yet');
  }

  async getEmail(_id: string): Promise<Email> {
    throw new Error('Not implemented yet');
  }

  async getThread(_threadId: string): Promise<Thread> {
    throw new Error('Not implemented yet');
  }

  async getAttachment(_emailId: string, _attachmentId: string): Promise<{ data: Buffer; meta: AttachmentMeta }> {
    throw new Error('Not implemented yet');
  }

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

  async markEmail(_emailId: string, _flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<void> {
    throw new Error('Not implemented yet');
  }
}
