import { build } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('android/app/src/main/assets/web');
await build({ build: { outDir, emptyOutDir: true, sourcemap: false } });
const file = resolve(outDir, 'index.html');
const policy =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
writeFileSync(
  file,
  readFileSync(file, 'utf8')
    .replace('<html', '<html data-platform="android"')
    .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`),
);
