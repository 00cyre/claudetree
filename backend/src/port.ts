import { createServer } from 'net';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const PORT_FILE = join(PROJECT_ROOT, '.claudetree-port');

export function findFreePort(preferred: number, range = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    function tryPort(port: number) {
      const srv = createServer();
      srv.once('error', () => {
        attempt++;
        if (attempt >= range) {
          reject(new Error(`No free port found in range ${preferred}–${preferred + range - 1}`));
        } else {
          tryPort(preferred + attempt);
        }
      });
      srv.listen(port, () => {
        srv.close(() => resolve(port));
      });
    }

    tryPort(preferred);
  });
}

export function writePortFile(port: number): void {
  writeFileSync(PORT_FILE, String(port), 'utf-8');
}

export function registerPortFileCleanup(): void {
  const cleanup = () => {
    try {
      if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE);
    } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
}
