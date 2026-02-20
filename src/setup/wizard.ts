import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import inquirer from 'inquirer';
import { CredentialStore } from '../auth/credential-store.js';
import { OAuthCallbackServer } from '../auth/oauth-server.js';
import { GmailAuth } from '../providers/gmail/auth.js';
import { OutlookAuth } from '../providers/outlook/auth.js';
import type { AccountCredentials, ProviderTypeValue } from '../models/types.js';
import { ProviderType } from '../models/types.js';
import { AccountManager } from '../account-manager.js';
import { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, OUTLOOK_CLIENT_ID } from '../oauth-config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const store = new CredentialStore();
const manager = new AccountManager(store);

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      console.log(`\nCould not open browser automatically. Please visit:\n${url}\n`);
    }
  });
}

async function testAndSave(creds: AccountCredentials): Promise<void> {
  console.log('\nTesting connection...');
  try {
    await manager.addAccount(creds);
    const result = await manager.testAccount(creds.id);
    if (result.success) {
      console.log(`Connection successful! Found ${result.folderCount} folder(s).`);
      console.log(`Account "${creds.name}" saved (id: ${creds.id}).`);
    } else {
      console.log(`Connection test failed: ${result.error}`);
      console.log('Credentials were saved anyway — you can retry later.');
    }
  } catch (error: any) {
    // Save credentials even if connection test fails so user doesn't lose them
    await store.save(creds);
    console.log(`Connection failed: ${error.message}`);
    console.log('Credentials were saved — you can retry later.');
  } finally {
    await manager.disconnectAll();
  }
}

async function promptAccountName(defaultName: string): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Account name:',
      default: defaultName,
    },
  ]);
  return name;
}

// ---------------------------------------------------------------------------
// Gmail Setup
// ---------------------------------------------------------------------------

async function setupGmail(): Promise<void> {
  console.log('\n--- Gmail Setup ---');
  console.log('A browser window will open for Google authorization.\n');

  const server = new OAuthCallbackServer();
  const port = await server.start();
  const redirectUri = `http://localhost:${port}/callback`;

  const gmailAuth = new GmailAuth(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, redirectUri);
  const { url, codeVerifier } = gmailAuth.getAuthUrl(redirectUri);

  console.log('\nOpening browser for Google authorization...');
  console.log(`If the browser does not open, visit:\n${url}\n`);
  openBrowser(url);

  let code: string;
  try {
    code = await server.waitForCode();
  } catch (err: any) {
    server.shutdown();
    throw new Error(`OAuth flow failed: ${err.message}`);
  }
  server.shutdown();

  console.log('Authorization code received. Exchanging for tokens...');
  const tokens = await gmailAuth.exchangeCode(code, codeVerifier);

  // Fetch email from Gmail profile using the access token
  const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json() as { emailAddress?: string };
  const email = profile.emailAddress ?? '';
  if (!email) throw new Error('Could not retrieve Gmail address from profile');
  console.log(`Authenticated as ${email}`);

  const name = await promptAccountName('Gmail');
  const id = crypto.randomUUID();

  const creds: AccountCredentials = {
    id,
    name,
    provider: ProviderType.Gmail,
    email: email.trim(),
    oauth: tokens,
  };

  await testAndSave(creds);
}

// ---------------------------------------------------------------------------
// Outlook Setup
// ---------------------------------------------------------------------------

async function setupOutlook(): Promise<void> {
  console.log('\n--- Outlook Setup ---');
  console.log('A browser window will open for Microsoft authorization.\n');

  const server = new OAuthCallbackServer();
  const port = await server.start();
  const redirectUri = `http://localhost:${port}`;

  const outlookAuth = new OutlookAuth(OUTLOOK_CLIENT_ID);
  const { url, codeVerifier } = await outlookAuth.getAuthUrl(redirectUri);

  console.log('\nOpening browser for Microsoft authorization...');
  console.log(`If the browser does not open, visit:\n${url}\n`);
  openBrowser(url);

  let code: string;
  try {
    code = await server.waitForCode();
  } catch (err: any) {
    server.shutdown();
    throw new Error(`OAuth flow failed: ${err.message}`);
  }
  server.shutdown();

  console.log('Authorization code received. Exchanging for tokens...');
  const result = await outlookAuth.exchangeCode(code, codeVerifier, redirectUri);

  // Extract email from MSAL account info
  const account = result.account as { username?: string } | undefined;
  const email = account?.username ?? '';
  if (!email) throw new Error('Could not retrieve email from Microsoft account');
  console.log(`Authenticated as ${email}`);

  const name = await promptAccountName('Outlook');
  const id = crypto.randomUUID();

  const creds: AccountCredentials = {
    id,
    name,
    provider: ProviderType.Outlook,
    email: email.trim(),
    oauth: {
      access_token: result.accessToken,
      refresh_token: '', // MSAL cache handles refresh tokens via file persistence
      expiry: result.expiresOn?.toISOString() ?? '',
      msal_home_account_id: result.homeAccountId,
    },
  };

  await testAndSave(creds);
}

// ---------------------------------------------------------------------------
// iCloud Setup
// ---------------------------------------------------------------------------

async function setupICloud(): Promise<void> {
  console.log('\n--- iCloud Mail Setup ---');
  console.log(
    'You need an app-specific password for iCloud Mail.\n' +
    'Generate one at https://appleid.apple.com/account/manage\n' +
    '(Sign In & Security > App-Specific Passwords)\n'
  );

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'iCloud email address:',
      validate: (v: string) => v.includes('@') || 'Enter a valid email address',
    },
    {
      type: 'password',
      name: 'password',
      message: 'App-specific password:',
      mask: '*',
      validate: (v: string) => v.trim().length > 0 || 'Password is required',
    },
  ]);

  const name = await promptAccountName('iCloud');
  const id = crypto.randomUUID();

  const creds: AccountCredentials = {
    id,
    name,
    provider: ProviderType.ICloud,
    email: answers.email.trim(),
    password: {
      password: answers.password,
      host: 'imap.mail.me.com',
      port: 993,
      tls: true,
      smtpHost: 'smtp.mail.me.com',
      smtpPort: 587,
    },
  };

  await testAndSave(creds);
}

// ---------------------------------------------------------------------------
// Generic IMAP Setup
// ---------------------------------------------------------------------------

async function setupIMAP(): Promise<void> {
  console.log('\n--- Generic IMAP Setup ---\n');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email address:',
      validate: (v: string) => v.includes('@') || 'Enter a valid email address',
    },
    {
      type: 'input',
      name: 'host',
      message: 'IMAP host:',
      validate: (v: string) => v.trim().length > 0 || 'Host is required',
    },
    {
      type: 'input',
      name: 'port',
      message: 'IMAP port:',
      default: '993',
      validate: (v: string) => {
        const n = parseInt(v, 10);
        return (n > 0 && n <= 65535) || 'Enter a valid port number (1-65535)';
      },
    },
    {
      type: 'confirm',
      name: 'tls',
      message: 'Use TLS?',
      default: true,
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*',
      validate: (v: string) => v.trim().length > 0 || 'Password is required',
    },
    {
      type: 'confirm',
      name: 'configureSmtp',
      message: 'Configure SMTP (for sending)?',
      default: false,
    },
  ]);

  let smtpHost: string | undefined;
  let smtpPort: number | undefined;

  if (answers.configureSmtp) {
    const smtp = await inquirer.prompt([
      {
        type: 'input',
        name: 'smtpHost',
        message: 'SMTP host:',
        validate: (v: string) => v.trim().length > 0 || 'SMTP host is required',
      },
      {
        type: 'input',
        name: 'smtpPort',
        message: 'SMTP port:',
        default: '587',
        validate: (v: string) => {
          const n = parseInt(v, 10);
          return (n > 0 && n <= 65535) || 'Enter a valid port number (1-65535)';
        },
      },
    ]);
    smtpHost = smtp.smtpHost.trim();
    smtpPort = parseInt(smtp.smtpPort, 10);
  }

  const name = await promptAccountName('IMAP');
  const id = crypto.randomUUID();

  const creds: AccountCredentials = {
    id,
    name,
    provider: ProviderType.IMAP,
    email: answers.email.trim(),
    password: {
      password: answers.password,
      host: answers.host.trim(),
      port: parseInt(answers.port, 10),
      tls: answers.tls,
      smtpHost,
      smtpPort,
    },
  };

  await testAndSave(creds);
}

// ---------------------------------------------------------------------------
// List / Remove
// ---------------------------------------------------------------------------

async function listAccounts(): Promise<void> {
  const accounts = await store.list();
  if (accounts.length === 0) {
    console.log('No accounts configured.');
    return;
  }
  console.log(`\nConfigured accounts (${accounts.length}):\n`);
  for (const acct of accounts) {
    console.log(`  ${acct.id}`);
    console.log(`    Name:     ${acct.name}`);
    console.log(`    Provider: ${acct.provider}`);
    console.log(`    Email:    ${acct.email}`);
    console.log('');
  }
}

async function removeAccount(id: string): Promise<void> {
  const acct = await store.get(id);
  if (!acct) {
    console.error(`Account not found: ${id}`);
    process.exit(1);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove account "${acct.name}" (${acct.email})?`,
      default: false,
    },
  ]);

  if (confirm) {
    await store.remove(id);
    console.log(`Account "${acct.name}" removed.`);
  } else {
    console.log('Cancelled.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --list
  if (args.includes('--list')) {
    await listAccounts();
    return;
  }

  // Handle --remove <id>
  const removeIdx = args.indexOf('--remove');
  if (removeIdx !== -1) {
    const id = args[removeIdx + 1];
    if (!id) {
      console.error('Usage: --remove <account-id>');
      process.exit(1);
    }
    await removeAccount(id);
    return;
  }

  // Interactive wizard
  console.log('@marlinjai/email-mcp Account Setup\n');

  let addMore = true;
  while (addMore) {
    const { provider } = await inquirer.prompt([
      {
        type: 'rawlist',
        name: 'provider',
        message: 'Select provider:',
        choices: [
          { name: 'Gmail', value: 'gmail' },
          { name: 'Outlook', value: 'outlook' },
          { name: 'iCloud', value: 'icloud' },
          { name: 'Other IMAP', value: 'imap' },
        ],
      },
    ]);

    switch (provider as ProviderTypeValue) {
      case ProviderType.Gmail:
        await setupGmail();
        break;
      case ProviderType.Outlook:
        await setupOutlook();
        break;
      case ProviderType.ICloud:
        await setupICloud();
        break;
      case ProviderType.IMAP:
        await setupIMAP();
        break;
      default:
        console.error(`Unknown provider: ${provider}`);
        process.exit(1);
    }

    const { another } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'another',
        message: 'Would you like to add another email account?',
        default: false,
      },
    ]);
    addMore = another;
  }

  console.log('\nSetup complete! You can now use the email tools in Claude Code.');
}

main().catch((err) => {
  console.error(`\nSetup failed: ${err.message}`);
  process.exit(1);
});
