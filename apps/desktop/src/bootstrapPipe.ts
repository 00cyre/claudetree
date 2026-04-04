import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { writeSync } from 'node:fs';

export interface BootstrapConfig {
  port: number;
  authToken: string;
  dataDir: string;
}

/**
 * Bind to loopback :0, grab the OS-assigned port, then close the server.
 */
export async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        return reject(new Error('Failed to get assigned port'));
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Generate a cryptographically random auth token.
 */
export function generateAuthToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Serialize BootstrapConfig as JSON and write it to file descriptor 3
 * of the child process. The fd is passed via spawn stdio option.
 */
export function writeBootstrapToFd3(fd: number, config: BootstrapConfig): void {
  const json = JSON.stringify(config) + '\n';
  writeSync(fd, json);
}
