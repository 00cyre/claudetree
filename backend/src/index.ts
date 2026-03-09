import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import projectsRouter from './routes/projects.js';
import worktreesRouter from './routes/worktrees.js';
import diffRouter from './routes/diff.js';
import commitRouter from './routes/commit.js';
import { setupTerminalWebSocket } from './terminal/pty.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/worktrees', worktreesRouter);
app.use('/api/diff', diffRouter);
app.use('/api/commit', commitRouter);

const server = createServer(app);

try {
  setupTerminalWebSocket(server);
} catch (err) {
  console.error('WebSocket/pty setup failed (node-pty may need rebuilding):', err);
}

server.listen(PORT, () => {
  console.log(`claudetree backend running on http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
