import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AccountManager } from './account-manager.js';
import { registerAccountTools } from './tools/accounts.js';
import { registerSendingTools } from './tools/sending.js';

export interface ServerResult {
  server: McpServer;
  accountManager: AccountManager;
}

export async function createServer(accountManager?: AccountManager): Promise<ServerResult> {
  const mgr = accountManager ?? new AccountManager();

  const server = new McpServer({
    name: 'email-mcp',
    version: '0.1.0',
  });

  // Register all tool groups
  registerAccountTools(server, mgr);
  registerSendingTools(server, mgr);

  return { server, accountManager: mgr };
}

export async function startServer(): Promise<void> {
  const { server } = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
