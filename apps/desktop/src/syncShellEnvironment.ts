import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Spawn a login shell and capture the full environment, then merge
 * PATH, SSH_AUTH_SOCK, and HOME into process.env.
 *
 * Must be called synchronously before app.whenReady().
 */
export function syncShellEnvironment(): void {
  const shell = existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash';

  let envOutput: string;
  try {
    envOutput = execFileSync(shell, ['-l', '-c', 'env'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env },
    });
  } catch (err) {
    throw new Error(
      `Failed to capture login shell environment from ${shell}: ${err instanceof Error ? err.message : err}`
    );
  }

  const envMap = new Map<string, string>();
  for (const line of envOutput.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      envMap.set(line.slice(0, idx), line.slice(idx + 1));
    }
  }

  const keysToMerge = ['PATH', 'SSH_AUTH_SOCK', 'HOME'];
  for (const key of keysToMerge) {
    const value = envMap.get(key);
    if (value) {
      process.env[key] = value;
    }
  }

  // Verify claude CLI is accessible
  try {
    execSync('which claude', { encoding: 'utf8', env: process.env });
  } catch {
    throw new Error(
      'claude CLI not found on PATH after shell environment sync. ' +
        'Ensure claude is installed and accessible from your login shell.'
    );
  }

  console.log('[syncShellEnvironment] Shell environment synced, claude CLI found');
}
