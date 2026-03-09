import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import projectsRouter from './routes/projects.js';
import worktreesRouter from './routes/worktrees.js';
import diffRouter from './routes/diff.js';
import commitRouter from './routes/commit.js';
import linearRouter from './routes/linear.js';
import { setupTerminalWebSocket, preInitializeSessions } from './terminal/pty.js';
import { discoverAllWorktrees } from './routes/worktrees.js';
import { linearClient } from './linear/client.js';
import { loadConfig } from './config.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/worktrees', worktreesRouter);
app.use('/api/diff', diffRouter);
app.use('/api/commit', commitRouter);
app.use('/api/linear', linearRouter);

const server = createServer(app);

try {
  setupTerminalWebSocket(server);
} catch (err) {
  console.error('WebSocket/pty setup failed (node-pty may need rebuilding):', err);
}

server.listen(PORT, async () => {
  console.log(`claudetree backend running on http://localhost:${PORT}`);

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

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
