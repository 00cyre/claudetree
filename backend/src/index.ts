import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import projectsRouter from './routes/projects.js';
import worktreesRouter from './routes/worktrees.js';
import diffRouter from './routes/diff.js';
import commitRouter from './routes/commit.js';
import linearRouter from './routes/linear.js';
import aiRouter from './routes/ai.js';
import statusRouter from './routes/status.js';
import pipelineRouter from './routes/pipeline.js';
import terminalRouter from './routes/terminal.js';
import { setupTerminalWebSocket, preInitializeSessions } from './terminal/pty.js';
import { discoverAllWorktrees } from './routes/worktrees.js';
import { linearClient } from './linear/client.js';
import { loadConfig, getInstanceName } from './config.js';

// --- Bootstrap config from fd3 (Electron main process) or fallback ---
interface BootstrapConfig {
  port: number;
  authToken: string;
  dataDir: string;
}

let bootstrapConfig: BootstrapConfig | null = null;

try {
  const fd3Data = readFileSync('/dev/fd/3', 'utf8');
  bootstrapConfig = JSON.parse(fd3Data.trim()) as BootstrapConfig;
  console.log(`[bootstrap] Received config via fd3: port=${bootstrapConfig.port}`);
} catch {
  // No fd3 available — running standalone (dev mode)
  console.log('[bootstrap] No fd3 pipe detected, using fallback config');
}

const PORT = bootstrapConfig?.port ?? parseInt(process.env.CLAUDETREE_PORT || '3001', 10);
const AUTH_TOKEN = bootstrapConfig?.authToken ?? null;

const app = express();

app.use(cors());
app.use(express.json());

// Healthz endpoint — exempt from auth
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Auth middleware — only active when running under Electron (bootstrap config present)
if (AUTH_TOKEN) {
  app.use((req, res, next) => {
    // Allow healthz without auth
    if (req.path === '/healthz') return next();

    const header = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    const token = header?.replace('Bearer ', '') || queryToken;

    if (token !== AUTH_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });
}

app.use('/api/projects', projectsRouter);
app.use('/api/worktrees', worktreesRouter);
app.use('/api/diff', diffRouter);
app.use('/api/commit', commitRouter);
app.use('/api/linear', linearRouter);
app.use('/api/ai', aiRouter);
app.use('/api/status', statusRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/terminal', terminalRouter);

const server = createServer(app);

try {
  setupTerminalWebSocket(server);
} catch (err) {
  console.error('WebSocket/pty setup failed (node-pty may need rebuilding):', err);
}

(async () => {
  server.listen(PORT, async () => {
    const instance = getInstanceName();
    console.log(`claudetree [${instance}] backend on http://localhost:${PORT}`);

    // Signal to Electron main process that we're ready
    if (bootstrapConfig) {
      process.stdout.write('READY\n');
    }

    const config = loadConfig();
    if (config.linearApiKey) {
      linearClient.connect(config.linearApiKey).catch((err) => {
        console.error('Linear MCP auto-connect failed:', err);
      });
    }

    // Pre-initialize Claude Code for all worktrees so switching tabs is instant
    try {
      const worktrees = await discoverAllWorktrees();
      preInitializeSessions(worktrees.map((w) => ({ id: w.id, path: w.path })));
    } catch (err) {
      console.error('Failed to pre-initialize worktree terminals:', err);
    }
  });
})();

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
