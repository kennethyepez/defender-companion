// Builds a private Windows release from the already audited lockfile/install.
// No tenant configuration, data, certificates, scripts from alerts or network calls.
import { build } from 'vite';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] ?? '');
if (!output.startsWith(join(root, '.local') + sep) || existsSync(output))
  throw new Error('Use a new directory inside the ignored .local folder.');
const app = join(output, 'app');
mkdirSync(app, { recursive: true });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const frontendOnly = new Set([
  'react',
  'react-dom',
  'lucide-react',
  '@simplewebauthn/browser',
  'scheduler',
]);
const runtimeDependencies = Object.fromEntries(
  Object.entries(pkg.dependencies).filter(([name]) => !frontendOnly.has(name)),
);
await build({
  configFile: false,
  root,
  build: {
    ssr: join(root, 'server/main.ts'),
    outDir: app,
    emptyOutDir: false,
    sourcemap: false,
    rolldownOptions: {
      external: Object.keys(pkg.dependencies),
      output: { entryFileNames: 'server.mjs' },
    },
  },
});
cpSync(join(root, 'dist'), join(app, 'dist'), { recursive: true });
writeFileSync(
  join(app, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      private: true,
      dependencies: runtimeDependencies,
    },
    null,
    2,
  ),
);
const npm =
  process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const dependencies = execFileSync(
  process.execPath,
  [npm, 'ls', '--omit=dev', '--parseable', '--all'],
  { cwd: root, encoding: 'utf8', windowsHide: true },
)
  .trim()
  .split(/\r?\n/)
  .filter((path) => resolve(path) !== root)
  .sort((a, b) => a.length - b.length);
const copied = [];
for (const path of dependencies) {
  const absolute = resolve(path);
  const local = relative(join(root, 'node_modules'), absolute).split(sep);
  const packageName = local[0].startsWith('@') ? local.slice(0, 2).join('/') : local[0];
  if (frontendOnly.has(packageName)) continue;
  if (!absolute.startsWith(join(root, 'node_modules') + sep) || realpathSync(absolute) !== absolute)
    throw new Error('Only canonical installed production dependencies may be copied.');
  if (copied.some((parent) => absolute.startsWith(parent + sep))) continue;
  const destination = join(app, relative(root, absolute));
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(absolute, destination, { recursive: true, dereference: false });
  copied.push(absolute);
}
console.log(
  JSON.stringify({ output, productionDependencyDirectories: copied.length, networkRequests: 0 }),
);
