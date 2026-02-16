# email-mcp

A unified MCP server for email access across Gmail, Outlook, iCloud, and generic IMAP providers.

## Features

- **Multi-provider support** -- Gmail (REST API), Outlook (Microsoft Graph), iCloud (IMAP), and generic IMAP/SMTP
- **OAuth2 authentication** -- Browser-based OAuth flows for Gmail and Outlook, with automatic token refresh
- **Full email client** -- Search, read, send, reply, forward, organize, and manage drafts
- **Encrypted credential storage** -- AES-256-GCM encryption at rest with machine-derived keys
- **Provider-native APIs** -- Uses Gmail API and Microsoft Graph where available for richer features, falls back to IMAP for universal compatibility

## Installation

Install globally from npm:

```bash
npm install -g email-mcp
```

Or run directly with npx (no install needed):

```bash
npx email-mcp
```

## Quick Start

1. Run the interactive setup wizard to add your first email account:

```bash
npx email-mcp setup
```

2. Add the server to your Claude Code MCP configuration (`.mcp.json`):

```json
{
  "mcpServers": {
    "email": {
      "command": "npx",
      "args": ["email-mcp"]
    }
  }
}
```

3. Start using email tools in Claude Code -- search your inbox, send emails, organize messages, and more.

## Provider Setup Guides

### Gmail

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Enable the **Gmail API** under APIs & Services.
4. Go to **Credentials** and create an **OAuth 2.0 Client ID** (Desktop application type).
5. Run the setup wizard:

```bash
npx email-mcp setup
# Select "Gmail" when prompted
# A browser window will open for authorization
# Grant the requested permissions and return to the terminal
```

### Outlook

1. Go to the [Azure Portal](https://portal.azure.com/) and navigate to **App registrations**.
2. Register a new application (select "Personal Microsoft accounts" for consumer Outlook).
3. Under **Authentication**, add a redirect URI for `http://localhost`.
4. Under **API permissions**, add `Mail.ReadWrite`, `Mail.Send`, and `offline_access`.
5. Run the setup wizard:

```bash
npx email-mcp setup
# Select "Outlook" when prompted
# A browser window will open for authorization
# Sign in and grant the requested permissions
```

### iCloud

1. Go to [appleid.apple.com](https://appleid.apple.com/) and sign in.
2. Navigate to **App-Specific Passwords** and generate a new password.
3. Run the setup wizard:

```bash
npx email-mcp setup
# Select "iCloud" when prompted
# Enter your iCloud email address
# Enter the app-specific password you generated
```

### Generic IMAP

Run the setup wizard with your IMAP/SMTP server details:

```bash
npx email-mcp setup
# Select "Other IMAP" when prompted
# Enter your IMAP host, port, and credentials
# Optionally enter SMTP host and port for sending
```

## Available Tools

### Account Management

| Tool | Description |
|------|-------------|
| `email_list_accounts` | List all configured accounts with connection status |
| `email_add_account` | Add a new IMAP or iCloud account (Gmail/Outlook require setup wizard) |
| `email_remove_account` | Remove an account and its stored credentials |
| `email_test_account` | Test connection to an account |

### Reading & Searching

| Tool | Description |
|------|-------------|
| `email_list_folders` | List all folders/labels for an account |
| `email_search` | Search emails with filters (folder, from, to, subject, date range, read/unread, etc.) |
| `email_get` | Get full email content by ID (headers, body, attachment metadata) |
| `email_get_thread` | Get an entire email thread/conversation |
| `email_get_attachment` | Download a specific attachment by ID (returns base64 data) |

### Sending & Drafts

| Tool | Description |
|------|-------------|
| `email_send` | Compose and send a new email (to, cc, bcc, subject, body) |
| `email_reply` | Reply to an email (supports reply-all, preserves threading) |
| `email_forward` | Forward an email to new recipients |
| `email_draft_create` | Save a draft without sending |
| `email_draft_list` | List all drafts |

### Organization

| Tool | Description |
|------|-------------|
| `email_move` | Move an email to a different folder |
| `email_delete` | Delete an email (trash or permanent) |
| `email_mark` | Mark as read/unread, starred, or flagged |
| `email_label` | Add/remove labels (Gmail only) |
| `email_folder_create` | Create a new folder |
| `email_get_labels` | List all labels with counts (Gmail only) |
| `email_get_categories` | List all categories (Outlook only) |

## Usage with Claude Code

Add the following to your `.mcp.json` file (project-level or global `~/.claude/.mcp.json`):

```json
{
  "mcpServers": {
    "email": {
      "command": "npx",
      "args": ["email-mcp"]
    }
  }
}
```

Once configured, you can ask Claude to interact with your email:

- "Check my inbox for unread messages"
- "Search for emails from alice@example.com in the last week"
- "Reply to the latest email from Bob and thank him"
- "Move all newsletters to the Archive folder"
- "Draft a follow-up email to the team about the meeting"

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode (watch for changes)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests (requires real email accounts)
npm run test:integration
```

## License

MIT
