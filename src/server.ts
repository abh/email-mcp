import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AccountManager } from './account-manager.js';
import { registerAccountTools } from './tools/accounts.js';
import { registerReadingTools } from './tools/reading.js';
import { registerSendingTools } from './tools/sending.js';
import { registerOrganizingTools } from './tools/organizing.js';

export interface ServerResult {
  server: McpServer;
  accountManager: AccountManager;
}

export interface CreateServerOptions {
  accountManager?: AccountManager;
  allowedAccountIds?: Set<string>;
}

export async function createServer(options?: CreateServerOptions): Promise<ServerResult> {
  const mgr = options?.accountManager ?? new AccountManager(undefined, options?.allowedAccountIds);

  const server = new McpServer({
    name: 'email-mcp',
    version: '0.1.0',
  });

  // Register all tool groups
  registerAccountTools(server, mgr);
  registerReadingTools(server, mgr);
  registerSendingTools(server, mgr);
  registerOrganizingTools(server, mgr);

  return { server, accountManager: mgr };
}

export async function startServer(allowedAccountIds?: Set<string>): Promise<void> {
  const { server } = await createServer({ allowedAccountIds });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
