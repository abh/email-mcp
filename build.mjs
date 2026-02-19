import { build, context } from 'esbuild';
import { chmod } from 'node:fs/promises';

// Inject OAuth credentials at build time from environment variables.
// The published npm package will have these baked into the bundle.
const define = {};
for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'OUTLOOK_CLIENT_ID']) {
  if (process.env[key]) {
    define[`process.env.${key}`] = JSON.stringify(process.env[key]);
  }
}

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  outbase: 'src',
  sourcemap: true,
  define,
  external: [
    'inquirer',
    'google-auth-library',
    'googleapis',
    '@azure/msal-node',
    '@microsoft/microsoft-graph-client',
    'imapflow',
    'mailparser',
    'nodemailer',
  ],
};

if (process.argv.includes('--watch')) {
  const ctx = await context({
    ...shared,
    entryPoints: ['src/index.ts', 'src/setup/wizard.ts'],
  });
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  // Build wizard (no shebang)
  await build({
    ...shared,
    entryPoints: ['src/setup/wizard.ts'],
  });

  // Build CLI entry with shebang
  await build({
    ...shared,
    entryPoints: ['src/index.ts'],
    banner: { js: '#!/usr/bin/env node\n' },
  });

  // Ensure CLI entry is executable
  await chmod('dist/index.js', 0o755);

  console.log('Build complete.');
}
