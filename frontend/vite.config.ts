import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function readBackendPort(): Promise<number> {
  const portFile = path.resolve(__dirname, '..', '.claudetree-port');
  const maxAttempts = 30;
  const interval = 200;

  return new Promise((resolve) => {
    let attempt = 0;

    function tryRead() {
      try {
        const port = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
        if (port > 0) {
          resolve(port);
          return;
        }
      } catch {}

      attempt++;
      if (attempt >= maxAttempts) {
        console.warn('Could not read .claudetree-port, falling back to 3001');
        resolve(3001);
      } else {
        setTimeout(tryRead, interval);
      }
    }

    tryRead();
  });
}

export default defineConfig(async () => {
  const backendPort = await readBackendPort();
  const frontendPort = parseInt(process.env.CLAUDETREE_FRONTEND_PORT || '5173', 10);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: frontendPort,
      strictPort: false,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
        '/terminal': {
          target: `ws://localhost:${backendPort}`,
          ws: true,
        },
      },
    },
  };
});
