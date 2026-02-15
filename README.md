# Clean My Email

MCP-powered Claude Code skill for intelligent email junk mail triage.

## Setup

1. Clone and build the MCP server:
   ```bash
   git clone https://github.com/nikolausm/imap-mcp-server.git mcp-server
   cd mcp-server && npm install && npm run build
   ```

2. Add to Claude Code global settings (`~/.claude/settings.json`):
   ```json
   {
     "mcpServers": {
       "imap": {
         "command": "node",
         "args": ["<path-to>/mcp-server/dist/index.js"]
       }
     }
   }
   ```

3. Configure email accounts: `cd mcp-server && npm run setup`

4. Use in Claude Code: `/clean-email`

## Features

- Multi-account support (Gmail, iCloud, Outlook)
- AI-powered junk classification
- Auto-blocking of spam domains (learns over time)
- Rescues non-junk with summaries
- Sorts promotions/newsletters to matching folders
