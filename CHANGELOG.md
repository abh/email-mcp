# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-02-20

### Fixed
- Outlook OAuth token renewal now works automatically — tokens no longer expire and require manual re-authentication
- IMAP search errors now surface actionable server messages instead of opaque "Command failed"

### Changed
- Outlook auth uses MSAL file-based cache persistence (`~/.email-mcp/msal-cache.json`) for refresh token survival across process restarts
- Token refresh uses `acquireTokenSilent()` instead of broken `acquireTokenByRefreshToken('')` approach
- `refreshTokenIfNeeded()` now logs refresh failures instead of silently swallowing them

### Added
- `OutlookAuth.refreshTokenSilent()` method using MSAL's persisted cache and `acquireTokenSilent()`
- `msal_home_account_id` field on `OAuthTokens` for identifying the cached MSAL account
- File-based `ICachePlugin` implementation for MSAL token cache persistence

## [1.1.2] - 2026-02-19

### Fixed
- IMAP folder search errors now surface actual server response instead of opaque "Command failed"
- Search on iCloud Junk folder no longer fails silently — added folder resolution that matches by path, name, special-use flag, or common aliases
- ImapFlow `search()` returning `false` on server rejection no longer crashes with TypeError on `.slice()`

### Added
- `formatImapError()` helper that extracts `responseText`, `serverResponseCode`, and `mailboxMissing` from ImapFlow errors
- `resolveFolder()` method that resolves folder names against the server's folder list, handling provider-specific naming (e.g., iCloud "Deleted Messages" vs "Trash")
- Outlook batch requests now use sequential numeric IDs to avoid case-insensitive collision on message IDs
- Outlook API endpoints now URL-encode message IDs and folder paths

## [1.1.1] - 2026-02-19

### Changed
- Reverted build-time credential injection — OAuth PKCE credentials are now directly in source (industry standard for public CLI clients)
- Removed `.env.example` (no longer needed)

## [1.1.0] - 2026-02-19

### Added
- Built-in OAuth credentials for Gmail and Outlook (PKCE) — users no longer need to create their own OAuth apps
- Zero-config setup for Gmail and Outlook via the interactive wizard

### Fixed
- Gmail PKCE flow now correctly passes `codeVerifier` to token exchange
- OAuth callback server accepts both `/callback` and `/` paths (fixes Outlook redirect)
- Build now produces correct shebangs (CLI entry only) and sets executable permissions
- Token refresh uses real OAuth credentials instead of empty strings

## [1.0.1] - 2026-02-19

### Fixed
- Added `mcpName` field to package.json for MCP Registry validation

## [1.0.0] - 2026-02-19

### Added
- Multi-provider email support: Gmail (REST API), Outlook (Microsoft Graph), iCloud (IMAP), generic IMAP/SMTP
- 24 MCP tools across 5 categories: account management, reading, sending, organization, batch operations
- Batch operations: `email_batch_delete`, `email_batch_move`, `email_batch_mark` with provider-native implementations
- Lightweight search mode (`returnBody=false` by default) reducing payload from ~1.4MB to ~20KB
- `sourceFolder` parameter for IMAP/iCloud move, delete, and mark operations
- Outlook folder resolution with localized display name support (English, German, Spanish, French)
- Interactive setup wizard with multi-account support ("add another?" loop)
- OAuth2 browser-based flows for Gmail and Outlook
- AES-256-GCM encrypted credential storage
- Sequential fallback for batch operations on providers without native batch support

[1.2.0]: https://github.com/marlinjai/email-mcp/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/marlinjai/email-mcp/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/marlinjai/email-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/marlinjai/email-mcp/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/marlinjai/email-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/marlinjai/email-mcp/releases/tag/v1.0.0
