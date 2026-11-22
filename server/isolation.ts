import { open, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
export function validateServiceIdentity(
  platform: string,
  expected: string,
  actual: string,
  groups = '',
) {
  if (platform === 'win32') {
    if (
      !/^S-1-5-80-(\d+-){3,}\d+$/.test(expected) ||
      expected !== actual ||
      groups.includes('S-1-5-32-544')
    )
      throw new Error(
        'Private access requires its dedicated non-administrator virtual service account.',
      );
  } else if (!/^\d+$/.test(expected) || expected === '0' || expected !== actual)
    throw new Error('Private access requires its dedicated non-root service identity.');
}
export async function assertServiceIsolation(
  expected: string,
  handoffFile: string,
  protectedFile: string,
) {
  if (process.platform === 'win32') {
    const user = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const groups = execFileSync('whoami.exe', ['/groups', '/fo', 'csv', '/nh'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const actual = user.match(/S-1-\d+(?:-\d+)+/)?.[0] ?? '';
    validateServiceIdentity('win32', expected, actual, groups);
  } else validateServiceIdentity(process.platform, expected, String(process.getuid?.() ?? 0));
  const readableHandoff = await open(handoffFile, 'r');
  await readableHandoff.close();
  // fs.access does not reliably test Windows ACLs. Real opens must be denied.
  async function requireDenied(path: string, mode: 'r' | 'r+' | 'wx') {
    let handle;
    try {
      handle = await open(path, mode);
    } catch (error) {
      if (['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
      throw error;
    }
    await handle.close();
    if (mode === 'wx') await unlink(path);
    throw new Error('The private service has excessive file access.');
  }
  await requireDenied(handoffFile, 'r+');
  await requireDenied(
    join(dirname(handoffFile), `.isolation-${randomBytes(16).toString('hex')}`),
    'wx',
  );
  if (!protectedFile)
    throw new Error('Configure a protected collector file to verify the isolation boundary.');
  await requireDenied(protectedFile, 'r');
}
