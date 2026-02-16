import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AccountManager } from '../account-manager.js';
import type { SearchQuery } from '../models/types.js';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerReadingTools(server: McpServer, accountManager: AccountManager): void {
  // --- email_list_folders ---
  server.tool(
    'email_list_folders',
    'List all email folders for an account',
    {
      accountId: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        const folders = await provider.listFolders();
        return jsonResult(folders);
      } catch (error: any) {
        return jsonResult({ error: error.message });
      }
    },
  );

  // --- email_search ---
  server.tool(
    'email_search',
    'Search emails with filters',
    {
      accountId: z.string(),
      folder: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      since: z.string().optional(),
      before: z.string().optional(),
      unreadOnly: z.boolean().optional(),
      starredOnly: z.boolean().optional(),
      hasAttachment: z.boolean().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);

        const query: SearchQuery = {};
        if (args.folder !== undefined) query.folder = args.folder;
        if (args.from !== undefined) query.from = args.from;
        if (args.to !== undefined) query.to = args.to;
        if (args.subject !== undefined) query.subject = args.subject;
        if (args.body !== undefined) query.body = args.body;
        if (args.since !== undefined) query.since = args.since;
        if (args.before !== undefined) query.before = args.before;
        if (args.unreadOnly !== undefined) query.unreadOnly = args.unreadOnly;
        if (args.starredOnly !== undefined) query.starredOnly = args.starredOnly;
        if (args.hasAttachment !== undefined) query.hasAttachment = args.hasAttachment;
        if (args.limit !== undefined) query.limit = args.limit;
        if (args.offset !== undefined) query.offset = args.offset;

        const emails = await provider.search(query);
        return jsonResult(emails);
      } catch (error: any) {
        return jsonResult({ error: error.message });
      }
    },
  );

  // --- email_get ---
  server.tool(
    'email_get',
    'Get a single email by ID',
    {
      accountId: z.string(),
      emailId: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        const email = await provider.getEmail(args.emailId);
        return jsonResult(email);
      } catch (error: any) {
        return jsonResult({ error: error.message });
      }
    },
  );

  // --- email_get_thread ---
  server.tool(
    'email_get_thread',
    'Get an email thread by thread ID',
    {
      accountId: z.string(),
      threadId: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        const thread = await provider.getThread(args.threadId);
        return jsonResult(thread);
      } catch (error: any) {
        return jsonResult({ error: error.message });
      }
    },
  );

  // --- email_get_attachment ---
  server.tool(
    'email_get_attachment',
    'Get an email attachment by ID, returns base64 encoded data',
    {
      accountId: z.string(),
      emailId: z.string(),
      attachmentId: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        const { data, meta } = await provider.getAttachment(args.emailId, args.attachmentId);
        return jsonResult({
          data: Buffer.from(data).toString('base64'),
          meta,
        });
      } catch (error: any) {
        return jsonResult({ error: error.message });
      }
    },
  );
}
