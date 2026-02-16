import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AccountManager } from '../account-manager.js';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function registerOrganizingTools(server: McpServer, accountManager: AccountManager): void {
  // --- email_move ---
  server.tool(
    'email_move',
    'Move an email to a different folder',
    {
      accountId: z.string(),
      emailId: z.string(),
      targetFolder: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        await provider.moveEmail(args.emailId, args.targetFolder);
        return jsonResult({ success: true });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );

  // --- email_delete ---
  server.tool(
    'email_delete',
    'Delete an email (moves to trash by default, or permanently deletes)',
    {
      accountId: z.string(),
      emailId: z.string(),
      permanent: z.boolean().optional(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        await provider.deleteEmail(args.emailId, args.permanent);
        return jsonResult({ success: true });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );

  // --- email_mark ---
  server.tool(
    'email_mark',
    'Mark an email as read/unread, starred, or flagged',
    {
      accountId: z.string(),
      emailId: z.string(),
      read: z.boolean().optional(),
      starred: z.boolean().optional(),
      flagged: z.boolean().optional(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        const flags: { read?: boolean; starred?: boolean; flagged?: boolean } = {};
        if (args.read !== undefined) flags.read = args.read;
        if (args.starred !== undefined) flags.starred = args.starred;
        if (args.flagged !== undefined) flags.flagged = args.flagged;
        await provider.markEmail(args.emailId, flags);
        return jsonResult({ success: true });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );

  // --- email_label ---
  server.tool(
    'email_label',
    'Add or remove labels on an email (Gmail only)',
    {
      accountId: z.string(),
      emailId: z.string(),
      addLabels: z.array(z.string()).optional(),
      removeLabels: z.array(z.string()).optional(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);

        // Check if the provider supports label operations
        if (!provider.addLabels || !provider.removeLabels) {
          return jsonResult({
            success: false,
            error: 'email_label is only supported on Gmail accounts',
            supportedProviders: ['gmail'],
          });
        }

        if (args.addLabels && args.addLabels.length > 0) {
          await provider.addLabels(args.emailId, args.addLabels);
        }
        if (args.removeLabels && args.removeLabels.length > 0) {
          await provider.removeLabels(args.emailId, args.removeLabels);
        }

        return jsonResult({ success: true });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );

  // --- email_folder_create ---
  server.tool(
    'email_folder_create',
    'Create a new email folder',
    {
      accountId: z.string(),
      name: z.string(),
      parentPath: z.string().optional(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);
        const folder = await provider.createFolder(args.name, args.parentPath);
        return jsonResult({ success: true, data: folder });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );

  // --- email_get_labels ---
  server.tool(
    'email_get_labels',
    'List all labels for an email account (Gmail only)',
    {
      accountId: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);

        if (!provider.listLabels) {
          return jsonResult({
            success: false,
            error: 'email_get_labels is only supported on Gmail accounts',
            supportedProviders: ['gmail'],
          });
        }

        const labels = await provider.listLabels();
        return jsonResult({ success: true, data: labels });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );

  // --- email_get_categories ---
  server.tool(
    'email_get_categories',
    'List all categories for an email account (Outlook only)',
    {
      accountId: z.string(),
    },
    async (args) => {
      try {
        const provider = await accountManager.getProvider(args.accountId);

        if (!provider.getCategories) {
          return jsonResult({
            success: false,
            error: 'email_get_categories is only supported on Outlook accounts',
            supportedProviders: ['outlook'],
          });
        }

        const categories = await provider.getCategories();
        return jsonResult({ success: true, data: categories });
      } catch (error: any) {
        return jsonResult({ success: false, error: error.message });
      }
    },
  );
}
