import { CredentialStore } from './auth/credential-store.js';
import { AccountManager, resolveAccountRef } from './account-manager.js';
import { startServer } from './server.js';

function splitCommaList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

async function handleAccountsCommand(args: string[]): Promise<void> {
  const store = new CredentialStore();
  const accounts = await store.list();

  if (args.length === 0) {
    // List accounts
    if (accounts.length === 0) {
      console.error('No accounts configured. Run `npx @marlinjai/email-mcp setup` to add one.');
      process.exit(0);
    }
    console.error('Configured accounts:\n');
    const idW = Math.max(2, ...accounts.map((a) => a.id.length));
    const nameW = Math.max(4, ...accounts.map((a) => a.name.length));
    const provW = Math.max(8, ...accounts.map((a) => a.provider.length));
    const emailW = Math.max(5, ...accounts.map((a) => a.email.length));
    const header = `  ${'ID'.padEnd(idW)}  ${'Name'.padEnd(nameW)}  ${'Provider'.padEnd(provW)}  Email`;
    const sep = `  ${'-'.repeat(idW)}  ${'-'.repeat(nameW)}  ${'-'.repeat(provW)}  ${'-'.repeat(emailW)}`;
    console.error(header);
    console.error(sep);
    for (const a of accounts) {
      console.error(`  ${a.id.padEnd(idW)}  ${a.name.padEnd(nameW)}  ${a.provider.padEnd(provW)}  ${a.email}`);
    }
    return;
  }

  if (args[0] === 'remove') {
    const ref = args[1];
    if (!ref) {
      console.error('Usage: npx email-mcp accounts remove <name-or-id>');
      process.exit(1);
    }
    const match = resolveAccountRef(ref, accounts);
    if (!match) {
      console.error(`Account not found: "${ref}"`);
      process.exit(1);
    }
    await store.remove(match.id);
    console.error(`Removed account "${match.name}" (${match.id})`);
    return;
  }

  console.error(`Unknown accounts subcommand: ${args[0]}`);
  console.error('Usage: npx email-mcp accounts [remove <name-or-id>]');
  process.exit(1);
}

function parseAccountsFilter(args: string[]): string[] | undefined {
  // CLI arg takes precedence over env var
  const idx = args.indexOf('--accounts');
  if (idx !== -1 && args[idx + 1]) {
    return splitCommaList(args[idx + 1]);
  }

  const envVal = process.env.EMAIL_MCP_ACCOUNTS;
  return envVal ? splitCommaList(envVal) : undefined;
}

function printUsage(): void {
  console.error(`email-mcp — MCP server for email

Usage:
  npx email-mcp                          Start the MCP server (stdio transport)
  npx email-mcp setup                    Add or configure an email account
  npx email-mcp accounts                 List configured accounts
  npx email-mcp accounts remove <ref>    Remove an account by name or ID

Options:
  --accounts <a,b,...>    Restrict this instance to specific accounts (by name or ID)
                          Also settable via EMAIL_MCP_ACCOUNTS env var
  --help                  Show this help message`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  // `npx email-mcp setup` → launch interactive wizard
  if (args.includes('setup')) {
    await import('./setup/wizard.js');
    return;
  }

  // `npx email-mcp accounts [remove <ref>]`
  if (args[0] === 'accounts') {
    await handleAccountsCommand(args.slice(1));
    return;
  }

  // Check if any accounts are configured
  const store = new CredentialStore();
  const accounts = await store.list();

  if (accounts.length === 0) {
    if (process.stdin.isTTY) {
      // User ran directly in terminal — launch wizard automatically
      console.log('No email accounts configured. Starting setup wizard...\n');
      await import('./setup/wizard.js');
      return;
    } else {
      // Launched by an MCP client — warn and start server anyway
      console.error(
        'No email accounts configured. Run `npx @marlinjai/email-mcp setup` to add an account.',
      );
    }
  }

  // Show help when run interactively with no arguments
  if (process.stdin.isTTY && args.length === 0) {
    printUsage();
    return;
  }

  // Parse --accounts / EMAIL_MCP_ACCOUNTS filtering
  const filterRefs = parseAccountsFilter(args);
  let allowedAccountIds: Set<string> | undefined;
  if (filterRefs) {
    allowedAccountIds = AccountManager.resolveAccountRefs(filterRefs, accounts);
  }

  await startServer(allowedAccountIds);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
