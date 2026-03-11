import { existsSync } from 'fs';
import type { Server } from 'http';
import { userInfo } from 'os';
import * as pty from 'node-pty';
import { WebSocketServer, WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { getWorktree } from '../routes/worktrees.js';
import { loadConfig, getWorktreeLink, setWorktreeLink } from '../config.js';
import { triggerExitAnalysis } from '../analysis-runner.js';

export interface WorktreeInfo {
  id: string;
  path: string;
}

export type ClaudeActivityState = 'booting' | 'active' | 'idle' | 'exited' | 'error';

export interface SessionStatus {
  state: ClaudeActivityState;
  lastActivity: number;
  stateStartedAt: number;
  description?: string;
}

interface PtySession {
  term: pty.IPty;
  clients: Set<WebSocket>;
  status: SessionStatus;
  outputBuffer: string;
  descriptionGenerated: boolean;
  worktreePath: string;
}

const sessions: Map<string, PtySession> = new Map();
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 30;
const CLAUDE_BOOT_DELAY_MS = 500;
const IDLE_THRESHOLD_MS = 3000;
const DESCRIPTION_BUFFER_THRESHOLD = 2000;
const DESCRIPTION_BUFFER_MAX = 3000;
const BOOT_SETTLE_MS = 8000; // ignore output for first 8s (shell + Claude boot noise)

function stripAnsi(str: string): string {
  return str
    // Strip all ESC sequences: CSI, OSC, SS2/SS3, DCS, charset, private modes, etc.
    .replace(/\x1B\[[0-9;?]*[a-zA-Z@`]/g, '')   // CSI sequences
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '') // OSC sequences
    .replace(/\x1BP[^\x1B]*\x1B\\/g, '')          // DCS sequences
    .replace(/\x1B[()#][A-Z0-9]/g, '')            // Charset selection
    .replace(/\x1B[NOcM78=>]/g, '')                // SS2, SS3, RIS, etc.
    .replace(/\x1B./g, '')                         // Catch-all remaining ESC+char
    .replace(/[\x00-\x1F\x7F]/g, ' ')             // Control chars to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function isOAuthToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
}

function createAnthropicClient(key: string): Anthropic {
  if (isOAuthToken(key)) {
    return new Anthropic({
      authToken: key,
      apiKey: null,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  }
  return new Anthropic({ apiKey: key });
}

async function generateDescription(session: PtySession, worktreeId: string): Promise<void> {
  session.descriptionGenerated = true;

  const config = loadConfig();
  if (!config.anthropicApiKey) return;

  try {
    const client = createAnthropicClient(config.anthropicApiKey);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Summarize in one short phrase (max 8 words) what task is being worked on in this terminal conversation. Return ONLY the phrase, nothing else:\n\n${session.outputBuffer}`,
      }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (text) {
      session.status.description = text;
      const existingLink = getWorktreeLink(session.worktreePath) ?? {};
      setWorktreeLink(session.worktreePath, { ...existingLink, description: text });
    }
  } catch (err) {
    console.error(`Failed to generate description for worktree ${worktreeId}:`, err);
  }
}

// Global idle-detection timer
setInterval(() => {
  const now = Date.now();
  for (const [, session] of sessions) {
    if (session.status.state === 'active' && now - session.status.lastActivity > IDLE_THRESHOLD_MS) {
      session.status.state = 'idle';
      session.status.stateStartedAt = now;
    }
  }
}, 1000);

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

  const now = Date.now();

  // Load persisted description if available
  const existingLink = getWorktreeLink(cwd);
  const persistedDescription = existingLink?.description;

  const session: PtySession = {
    term,
    clients: new Set(),
    status: {
      state: 'booting',
      lastActivity: now,
      stateStartedAt: now,
      description: persistedDescription,
    },
    outputBuffer: '',
    descriptionGenerated: !!persistedDescription,
    worktreePath: cwd,
  };
  sessions.set(worktreeId, session);

  const sessionCreatedAt = now;

  term.onData((data: string) => {
    broadcastToClients(session, data);

    // Status tracking
    const stripped = stripAnsi(data);
    if (stripped.length > 0) {
      const now = Date.now();
      session.status.lastActivity = now;

      if (session.status.state !== 'active') {
        session.status.state = 'active';
        session.status.stateStartedAt = now;
      }

      // Skip boot noise (shell prompt, Claude startup banner) before accumulating
      const pastBootPhase = now - sessionCreatedAt > BOOT_SETTLE_MS;
      if (pastBootPhase && session.outputBuffer.length < DESCRIPTION_BUFFER_MAX) {
        session.outputBuffer += stripped + ' ';
      }

      // Trigger description generation once we have enough post-boot context
      if (pastBootPhase && !session.descriptionGenerated && session.outputBuffer.length >= DESCRIPTION_BUFFER_THRESHOLD) {
        generateDescription(session, worktreeId);
      }
    }
  });

  term.onExit(() => {
    session.status.state = 'exited';
    session.status.stateStartedAt = Date.now();
    triggerExitAnalysis(worktreeId, session.worktreePath);
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

export function getAllSessionStatuses(): Record<string, SessionStatus> {
  const result: Record<string, SessionStatus> = {};
  for (const [id, session] of sessions) {
    result[id] = { ...session.status };
  }
  return result;
}

export function writeToSession(worktreeId: string, text: string): boolean {
  const session = sessions.get(worktreeId);
  if (!session) return false;
  session.term.write(text);
  return true;
}
