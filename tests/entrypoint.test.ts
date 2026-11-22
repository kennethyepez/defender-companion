import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('refuses a real file connection under the desktop user even on localhost', () => {
  let message = '';
  try {
    execFileSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../server/main.ts', import.meta.url)),
      ],
      {
        cwd: tmpdir(),
        windowsHide: true,
        timeout: 20000,
        env: {
          SystemRoot: process.env.SystemRoot,
          PATH: process.env.PATH,
          APP_ORIGIN: 'http://localhost:4318',
          RP_ID: 'localhost',
          HANDOFF_FILE: join(tmpdir(), 'nonexistent-companion-input.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    message = String((error as { stderr?: Buffer }).stderr ?? '');
  }
  expect(message).toContain('dedicated non-');
}, 25000);
