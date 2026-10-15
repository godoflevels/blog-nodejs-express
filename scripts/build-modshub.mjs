// Bundles the ModsHub Post Studio client (client/modshub) into
// public/modshub-studio/. The output is committed, so production only needs
// `npm install && npm start`; run this after changing anything in client/.
import { build, context } from 'esbuild';
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'public', 'modshub-studio');
const watch = process.argv.includes('--watch');

if (existsSync(outdir)) rmSync(outdir, { recursive: true, force: true });

const options = {
  absWorkingDir: root,
  entryPoints: { studio: 'client/modshub/main.jsx' },
  outdir,
  bundle: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16', 'firefox110'],
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  loader: { '.woff2': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  legalComments: 'none',
  logLevel: 'info',
  metafile: false,
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching client/modshub …');
} else {
  await build(options);
}
