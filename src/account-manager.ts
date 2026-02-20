import { CredentialStore } from './auth/credential-store.js';
import { GmailAdapter } from './providers/gmail/adapter.js';
import { GmailAuth } from './providers/gmail/auth.js';
import { OutlookAdapter } from './providers/outlook/adapter.js';
import { OutlookAuth } from './providers/outlook/auth.js';
import { ICloudAdapter } from './providers/icloud/adapter.js';
import { ImapAdapter } from './providers/imap/adapter.js';
import type { EmailProvider } from './providers/provider.js';
import type { Account, AccountCredentials, ProviderTypeValue } from './models/types.js';
import { ProviderType } from './models/types.js';
import { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, OUTLOOK_CLIENT_ID } from './oauth-config.js';

function createProvider(provider: ProviderTypeValue): EmailProvider {
  switch (provider) {
    case ProviderType.Gmail:
      return new GmailAdapter();
    case ProviderType.Outlook:
      return new OutlookAdapter();
    case ProviderType.ICloud:
      return new ICloudAdapter();
    case ProviderType.IMAP:
      return new ImapAdapter();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export class AccountManager {
  private store: CredentialStore;
  private providers: Map<string, EmailProvider> = new Map();
  private credentials: Map<string, AccountCredentials> = new Map();

  constructor(store?: CredentialStore) {
    this.store = store ?? new CredentialStore();
  }

  async listAccounts(): Promise<Account[]> {
    const creds = await this.store.list();
    return creds.map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      email: c.email,
      connected: this.providers.has(c.id),
    }));
  }

  async getProvider(accountId: string): Promise<EmailProvider> {
    const existing = this.providers.get(accountId);
    if (existing) return existing;

    // Auto-connect if not connected
    await this.connectAccount(accountId);
    const provider = this.providers.get(accountId);
    if (!provider) throw new Error(`Failed to connect account ${accountId}`);
    return provider;
  }

  async connectAccount(accountId: string): Promise<void> {
    const creds = await this.store.get(accountId);
    if (!creds) throw new Error(`Account ${accountId} not found`);

    // Check if OAuth token needs refresh
    if (creds.oauth) {
      await this.refreshTokenIfNeeded(creds);
    }

    const provider = createProvider(creds.provider);
    await provider.connect(creds);
    this.providers.set(accountId, provider);
    this.credentials.set(accountId, creds);
  }

  async addAccount(creds: AccountCredentials): Promise<void> {
    await this.store.save(creds);
    await this.connectAccount(creds.id);
  }

  async removeAccount(accountId: string): Promise<void> {
    await this.disconnectAccount(accountId);
    await this.store.remove(accountId);
  }

  async disconnectAccount(accountId: string): Promise<void> {
    const provider = this.providers.get(accountId);
    if (provider) {
      try {
        await provider.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.providers.delete(accountId);
      this.credentials.delete(accountId);
    }
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.providers.keys());
    await Promise.allSettled(ids.map((id) => this.disconnectAccount(id)));
  }

  async testAccount(accountId: string): Promise<{ success: boolean; folderCount: number; error?: string }> {
    try {
      const provider = await this.getProvider(accountId);
      return await provider.testConnection();
    } catch (error: any) {
      return { success: false, folderCount: 0, error: error.message };
    }
  }

  private async refreshTokenIfNeeded(creds: AccountCredentials): Promise<void> {
    if (!creds.oauth?.expiry) return;

    const expiryDate = new Date(creds.oauth.expiry);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiryDate > fiveMinutesFromNow) return;

    try {
      if (creds.provider === ProviderType.Gmail) {
        const auth = new GmailAuth(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
        const newTokens = await auth.refreshAccessToken(creds.oauth.refresh_token);
        creds.oauth = newTokens;
        await this.store.save(creds);
      } else if (creds.provider === ProviderType.Outlook) {
        const outlookAuth = new OutlookAuth(OUTLOOK_CLIENT_ID);
        const homeAccountId = creds.oauth.msal_home_account_id;

        if (homeAccountId) {
          // Preferred: use MSAL's persisted cache for silent token refresh
          const result = await outlookAuth.refreshTokenSilent(homeAccountId);
          creds.oauth = {
            access_token: result.accessToken,
            refresh_token: creds.oauth.refresh_token,
            expiry: result.expiresOn?.toISOString() ?? '',
            msal_home_account_id: result.homeAccountId ?? homeAccountId,
          };
        } else if (creds.oauth.refresh_token) {
          // Fallback: use stored refresh token directly (legacy credentials)
          const result = await outlookAuth.refreshToken(creds.oauth.refresh_token);
          creds.oauth = {
            access_token: result.accessToken,
            refresh_token: creds.oauth.refresh_token,
            expiry: result.expiresOn?.toISOString() ?? '',
          };
        } else {
          throw new Error('No MSAL account ID or refresh token — re-authenticate via setup wizard');
        }

        await this.store.save(creds);
      }
    } catch (error: any) {
      // Log the refresh failure so users know why connection fails
      console.error(`Token refresh failed for ${creds.provider}: ${error.message}`);
    }
  }
}
