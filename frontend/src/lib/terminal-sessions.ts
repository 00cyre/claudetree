import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface TerminalControlMessage {
  source: 'claudetree';
  type: 'error';
  message: string;
}

interface StatusListener {
  (status: TerminalStatus, errorMessage: string | null): void;
}

interface ExitListener {
  (): void;
}

export interface TerminalSession {
  term: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket;
  status: TerminalStatus;
  errorMessage: string | null;
  attached: boolean;
}

const TERMINAL_THEME = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
};

const sessions = new Map<string, TerminalSession>();
const statusListeners = new Map<string, Set<StatusListener>>();
const exitListeners = new Map<string, Set<ExitListener>>();

function parseControlMessage(data: string): TerminalControlMessage | null {
  try {
    const parsed = JSON.parse(data) as Partial<TerminalControlMessage>;
    if (parsed.source === 'claudetree' && parsed.type === 'error' && typeof parsed.message === 'string') {
      return parsed as TerminalControlMessage;
    }
  } catch {
    // Terminal output is plain text
  }
  return null;
}

function notifyStatus(worktreeId: string, status: TerminalStatus, errorMessage: string | null) {
  const listeners = statusListeners.get(worktreeId);
  if (listeners) {
    for (const fn of listeners) fn(status, errorMessage);
  }
}

function notifyExit(worktreeId: string) {
  const listeners = exitListeners.get(worktreeId);
  if (listeners) {
    for (const fn of listeners) fn();
  }
}

function createSession(worktreeId: string): TerminalSession {
  const term = new Terminal({
    theme: TERMINAL_THEME,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    cursorBlink: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${worktreeId}`);

  const session: TerminalSession = {
    term,
    fitAddon,
    ws,
    status: 'connecting',
    errorMessage: null,
    attached: false,
  };

  ws.onopen = () => {
    session.status = 'connected';
    session.errorMessage = null;
    notifyStatus(worktreeId, 'connected', null);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  };

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') return;

    const controlMessage = parseControlMessage(event.data);
    if (controlMessage) {
      session.status = 'error';
      session.errorMessage = controlMessage.message;
      notifyStatus(worktreeId, 'error', controlMessage.message);
      term.write(`\r\n[${controlMessage.message}]\r\n`);
      return;
    }

    term.write(event.data);
  };

  ws.onerror = () => {
    session.status = 'error';
    session.errorMessage = 'Terminal connection failed.';
    notifyStatus(worktreeId, 'error', session.errorMessage);
  };

  ws.onclose = (event) => {
    if (event.code !== 1000) {
      const reason = event.reason || 'Terminal session ended unexpectedly.';
      session.status = 'error';
      session.errorMessage = reason;
      notifyStatus(worktreeId, 'error', reason);
      term.write(`\r\n[${reason}]\r\n`);
      return;
    }

    session.status = 'idle';
    session.errorMessage = null;
    notifyStatus(worktreeId, 'idle', null);
    term.write('\r\n[Session ended]\r\n');
    notifyExit(worktreeId);
  };

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  term.onResize(({ cols, rows }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });

  sessions.set(worktreeId, session);
  return session;
}

export function getOrCreateSession(worktreeId: string): TerminalSession {
  const existing = sessions.get(worktreeId);
  if (existing) return existing;
  return createSession(worktreeId);
}

export function attachSession(worktreeId: string, container: HTMLDivElement): TerminalSession {
  const session = getOrCreateSession(worktreeId);
  const { term, fitAddon } = session;

  if (!term.element) {
    // First time — open creates the DOM structure
    term.open(container);
  } else {
    // Reparent the existing terminal element
    container.appendChild(term.element);
  }

  session.attached = true;

  // Fit after a frame so the container has its final dimensions
  requestAnimationFrame(() => {
    fitAddon.fit();
  });

  return session;
}

export function detachSession(worktreeId: string): void {
  const session = sessions.get(worktreeId);
  if (!session) return;

  session.attached = false;
  // Remove from DOM but don't dispose — keeps terminal buffer alive
  session.term.element?.remove();
}

export function destroySession(worktreeId: string): void {
  const session = sessions.get(worktreeId);
  if (!session) return;

  session.ws.close();
  session.term.dispose();
  sessions.delete(worktreeId);
  statusListeners.delete(worktreeId);
  exitListeners.delete(worktreeId);
}

export function onStatusChange(worktreeId: string, listener: StatusListener): () => void {
  let set = statusListeners.get(worktreeId);
  if (!set) {
    set = new Set();
    statusListeners.set(worktreeId, set);
  }
  set.add(listener);
  return () => { set!.delete(listener); };
}

export function onExit(worktreeId: string, listener: ExitListener): () => void {
  let set = exitListeners.get(worktreeId);
  if (!set) {
    set = new Set();
    exitListeners.set(worktreeId, set);
  }
  set.add(listener);
  return () => { set!.delete(listener); };
}
