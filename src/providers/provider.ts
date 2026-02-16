import type {
  Email,
  Folder,
  Thread,
  SearchQuery,
  Contact,
  AttachmentMeta,
  AccountCredentials,
  ProviderTypeValue,
} from '../models/types.js';

export interface SendEmailParams {
  to: Contact[];
  cc?: Contact[];
  bcc?: Contact[];
  subject: string;
  body: { text?: string; html?: string };
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  inReplyTo?: string;
  references?: string[];
}

export interface EmailProvider {
  readonly providerType: ProviderTypeValue;

  connect(credentials: AccountCredentials): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<{ success: boolean; folderCount: number; error?: string }>;

  listFolders(): Promise<Folder[]>;
  createFolder(name: string, parentPath?: string): Promise<Folder>;

  search(query: SearchQuery): Promise<Email[]>;
  getEmail(id: string): Promise<Email>;
  getThread(threadId: string): Promise<Thread>;
  getAttachment(emailId: string, attachmentId: string): Promise<{ data: Buffer; meta: AttachmentMeta }>;

  sendEmail(params: SendEmailParams): Promise<{ id: string; threadId?: string }>;
  createDraft(params: SendEmailParams): Promise<{ id: string }>;
  listDrafts(limit?: number, offset?: number): Promise<Email[]>;

  moveEmail(emailId: string, targetFolder: string): Promise<void>;
  deleteEmail(emailId: string, permanent?: boolean): Promise<void>;
  markEmail(emailId: string, flags: { read?: boolean; starred?: boolean; flagged?: boolean }): Promise<void>;

  // Provider-specific (optional)
  addLabels?(emailId: string, labels: string[]): Promise<void>;
  removeLabels?(emailId: string, labels: string[]): Promise<void>;
  listLabels?(): Promise<Array<{ id: string; name: string; messageCount: number }>>;
  getCategories?(): Promise<string[]>;
}
