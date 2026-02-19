// Publisher-provided OAuth credentials (PKCE public clients).
// Values are injected at build time via esbuild `define`.
// Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and OUTLOOK_CLIENT_ID
// as environment variables before building.

export const GMAIL_CLIENT_ID: string = process.env.GMAIL_CLIENT_ID ?? '';
export const GMAIL_CLIENT_SECRET: string = process.env.GMAIL_CLIENT_SECRET ?? '';
export const OUTLOOK_CLIENT_ID: string = process.env.OUTLOOK_CLIENT_ID ?? '';
