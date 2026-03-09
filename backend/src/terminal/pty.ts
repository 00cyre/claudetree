import * as pty from 'node-pty';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { getWorktree } from '../routes/worktrees.js';

interface PtySession {
  term: pty.IPty;
  clients: Set<WebSocket>;
}

const sessions: Map<string, PtySession> = new Map();

export function setupTerminalWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: undefined });

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
    const shell = process.platform === 'darwin' ? 'zsh' : 'bash';
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: wt.path,
      env: { ...process.env } as Record<string, string>,
    });

    session = { term, clients: new Set() };
    sessions.set(worktreeId, session);

    term.onData((data: string) => {
      for (const client of session!.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    });

    term.onExit(() => {
      sessions.delete(worktreeId);
      for (const client of session!.clients) {
        client.close();
      }
    });

    // Launch claude in the worktree
    setTimeout(() => {
      term.write('claude\r');
    }, 500);
  }

  session.clients.add(ws);

  ws.on('message', (data) => {
    const msg = data.toString();
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        session?.term.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {
      // Not JSON, treat as terminal input
    }
    session?.term.write(msg);
  });

  ws.on('close', () => {
    session?.clients.delete(ws);
  });
}

export function killSession(worktreeId: string): void {
  const session = sessions.get(worktreeId);
  if (session) {
    session.term.kill();
    sessions.delete(worktreeId);
  }
}
