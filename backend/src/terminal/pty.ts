import { existsSync } from 'fs';
import type { Server } from 'http';
import { userInfo } from 'os';
import * as pty from 'node-pty';
import { WebSocketServer, WebSocket } from 'ws';
import { getWorktree } from '../routes/worktrees.js';

export interface WorktreeInfo {
  id: string;
  path: string;
}

interface PtySession {
  term: pty.IPty;
  clients: Set<WebSocket>;
}

const sessions: Map<string, PtySession> = new Map();
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 30;
const CLAUDE_BOOT_DELAY_MS = 500;

function resolveShell(): string {
  const candidateShells = [
    process.env.SHELL,
    userInfo().shell,
    process.platform === 'darwin' ? '/bin/zsh' : undefined,
    '/bin/bash',
    'zsh',
    'bash',
  ];

  for (const shell of candidateShells) {
    if (!shell) {
      continue;
    }

    if (shell.startsWith('/')) {
      if (existsSync(shell)) {
        return shell;
      }
      continue;
    }

    return shell;
  }

  throw new Error('No usable shell found for terminal session.');
}

function getTerminalEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.FORCE_COLOR = '3';
  return env;
}

function sendSocketError(ws: WebSocket, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify({ source: 'claudetree', type: 'error', message }));
}

function broadcastToClients(session: PtySession, data: string): void {
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function createSession(worktreeId: string, cwd: string): PtySession {
  if (!existsSync(cwd)) {
    throw new Error(`Worktree path does not exist: ${cwd}`);
  }

  const shell = resolveShell();
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS,
    cwd,
    env: getTerminalEnv(),
  });

  const session: PtySession = { term, clients: new Set() };
  sessions.set(worktreeId, session);

  term.onData((data: string) => {
    broadcastToClients(session, data);
  });

  term.onExit(() => {
    sessions.delete(worktreeId);
    for (const client of session.clients) {
      client.close();
    }
  });

  // Launch Claude after the shell is ready in the worktree directory.
  setTimeout(() => {
    term.write('claude --dangerously-skip-permissions\r');
  }, CLAUDE_BOOT_DELAY_MS);

  return session;
}

export function setupTerminalWebSocket(server: Server): void {
  // We route upgrades manually so each socket is upgraded exactly once.
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually to support path-based routing
  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    const match = url.match(/^\/terminal\/(.+)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const worktreeId = match[1];
      handleConnection(ws, worktreeId);
    });
  });
}

function handleConnection(ws: WebSocket, worktreeId: string): void {
  const wt = getWorktree(worktreeId);
  if (!wt) {
    ws.close(1008, 'Worktree not found');
    return;
  }

  let session = sessions.get(worktreeId);
  if (!session) {
    try {
      session = createSession(worktreeId, wt.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to spawn terminal for worktree ${worktreeId}:`, error);
      sendSocketError(ws, `Terminal spawn failed: ${message}`);
      ws.close(1011, 'Terminal spawn failed');
      return;
    }
  }

  session.clients.add(ws);

  ws.on('message', (data) => {
    const msg = data.toString();
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        session.term.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {
      // Not JSON, treat as terminal input
    }
    session.term.write(msg);
  });

  ws.on('close', () => {
    session.clients.delete(ws);
  });
}

export function killSession(worktreeId: string): void {
  const session = sessions.get(worktreeId);
  if (session) {
    session.term.kill();
    sessions.delete(worktreeId);
  }
}

/**
 * Pre-initialize Claude Code sessions for all given worktrees.
 * Called on startup so each worktree has its own Claude instance ready.
 */
export function preInitializeSessions(worktrees: WorktreeInfo[]): void {
  for (const wt of worktrees) {
    if (sessions.has(wt.id)) continue;
    if (!existsSync(wt.path)) continue;
    try {
      createSession(wt.id, wt.path);
      console.log(`Pre-initialized Claude Code for worktree ${wt.id}`);
    } catch (err) {
      console.error(`Failed to pre-initialize terminal for ${wt.id}:`, err);
    }
  }
}
