import {
  PublicClientApplication,
  CryptoProvider,
  type AuthenticationResult,
} from '@azure/msal-node';

export interface OutlookAuthResult {
  accessToken: string;
  expiresOn: Date | null;
  idToken?: string;
  account?: unknown;
}

export class OutlookAuth {
  static readonly AUTHORITY = 'https://login.microsoftonline.com/consumers';
  static readonly SCOPES = ['Mail.ReadWrite', 'Mail.Send', 'offline_access'];

  private pca: InstanceType<typeof PublicClientApplication>;
  private cryptoProvider: InstanceType<typeof CryptoProvider>;

  constructor(clientId: string) {
    this.pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: OutlookAuth.AUTHORITY,
      },
    });
    this.cryptoProvider = new CryptoProvider();
  }

  async getAuthUrl(redirectUri: string): Promise<{ url: string; codeVerifier: string }> {
    const { verifier, challenge } = await this.cryptoProvider.generatePkceCodes();

    const url = await this.pca.getAuthCodeUrl({
      scopes: OutlookAuth.SCOPES,
      redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    });

    return { url, codeVerifier: verifier };
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<OutlookAuthResult> {
    const result: AuthenticationResult = await this.pca.acquireTokenByCode({
      code,
      codeVerifier,
      scopes: OutlookAuth.SCOPES,
      redirectUri,
    });

    return {
      accessToken: result.accessToken,
      expiresOn: result.expiresOn,
      idToken: result.idToken,
      account: result.account,
    };
  }

  async refreshToken(refreshToken: string): Promise<OutlookAuthResult> {
    const result = await this.pca.acquireTokenByRefreshToken({
      refreshToken,
      scopes: OutlookAuth.SCOPES,
    });

    if (!result) {
      throw new Error('Failed to refresh Outlook token');
    }

    return {
      accessToken: result.accessToken,
      expiresOn: result.expiresOn,
    };
  }
}
