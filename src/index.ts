import { CredentialStore } from './auth/credential-store.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // `npx email-mcp setup` → launch interactive wizard
  if (args.includes('setup')) {
    await import('./setup/wizard.js');
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

  await startServer();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
