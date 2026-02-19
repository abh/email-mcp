# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

[1.1.0]: https://github.com/marlinjai/email-mcp/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/marlinjai/email-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/marlinjai/email-mcp/releases/tag/v1.0.0
