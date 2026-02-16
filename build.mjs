import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/index.ts', 'src/setup/wizard.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  sourcemap: true,
  external: ['inquirer'],
  banner: {
    js: '#!/usr/bin/env node',
  },
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(options);
  console.log('Build complete.');
}
