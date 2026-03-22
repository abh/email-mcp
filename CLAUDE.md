# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
pnpm build          # esbuild bundle → dist/ (via build.mjs)
pnpm dev            # esbuild watch mode
pnpm test           # vitest run (all unit tests)
pnpm test:watch     # vitest in watch mode
npx vitest run tests/providers/gmail.test.ts  # run a single test file
pnpm test:integration  # requires EMAIL_MCP_INTEGRATION=1 and real accounts
```

Build uses esbuild (not tsc) — see `build.mjs`. TypeScript compilation is ESM (`"type": "module"`) targeting Node 20. Dependencies like `imapflow`, `googleapis`, `@azure/msal-node` are externalized from the bundle.

## Architecture

This is an MCP server (`@modelcontextprotocol/sdk`) that exposes 24 email tools over stdio transport. The server connects to multiple email providers simultaneously through provider adapters.

### Core Flow

```
index.ts → server.ts → registers tool groups → tools call AccountManager → AccountManager routes to providers
```

- **`AccountManager`** (`src/account-manager.ts`): Central hub. Manages provider lifecycle, auto-connects on first use, handles OAuth token refresh for Gmail/Outlook. Backed by `CredentialStore` for encrypted persistence.
- **`CredentialStore`** (`src/auth/credential-store.ts`): AES-256-GCM encrypted credential storage at `~/.email-mcp/`.

### Provider Pattern

All providers implement `EmailProvider` interface (`src/providers/provider.ts`). Four implementations:

| Provider | Strategy | Adapter |
|----------|----------|---------|
| Gmail | Google REST API via `googleapis` | `src/providers/gmail/adapter.ts` |
| Outlook | Microsoft Graph API via `@microsoft/microsoft-graph-client` | `src/providers/outlook/adapter.ts` |
| iCloud | Extends IMAP adapter with Apple defaults | `src/providers/icloud/adapter.ts` |
| IMAP | Generic IMAP via `imapflow` + SMTP via `nodemailer` | `src/providers/imap/adapter.ts` |

iCloud is a thin subclass of IMAP that injects `imap.mail.me.com` defaults. Batch operations (`batchDelete`, `batchMove`, `batchMark`) are optional on the interface — tools fall back to sequential calls when a provider doesn't implement them.

### Tool Groups

Tools are registered in `src/tools/` and split by domain:
- **accounts.ts** — list/add/remove/test accounts
- **reading.ts** — search, get email, threads, attachments, folders
- **sending.ts** — send, reply, forward, drafts
- **organizing.ts** — move, delete, mark, label, batch ops

Each tool handler follows the pattern: validate args with zod → get provider via `AccountManager.getProvider()` → call provider method → return JSON result.

### Types

`src/models/types.ts` defines all shared types (`Email`, `Folder`, `Thread`, `SearchQuery`, `AccountCredentials`, etc.) and the `ProviderType` const enum (`gmail`, `outlook`, `icloud`, `imap`).

### OAuth

Gmail and Outlook use embedded OAuth client IDs (`src/oauth-config.ts`) with PKCE flows. Auth helpers live alongside their providers (`src/providers/gmail/auth.ts`, `src/providers/outlook/auth.ts`). The setup wizard (`src/setup/wizard.ts`) handles interactive OAuth and iCloud/IMAP credential collection.

## Testing

Tests use vitest with globals enabled. Test files mirror source structure under `tests/`. Provider tests mock the underlying APIs (googleapis, Graph client, imapflow). The integration smoke test (`tests/integration/smoke.test.ts`) requires real accounts and is gated behind `EMAIL_MCP_INTEGRATION=1`.
