import { useEffect, useRef, useState, type RefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'error';
type TerminalRefs = {
  termRef: RefObject<Terminal | null>;
  wsRef: RefObject<WebSocket | null>;
  status: TerminalStatus;
  errorMessage: string | null;
};

interface TerminalControlMessage {
  source: 'claudetree';
  type: 'error';
  message: string;
}

const TERMINAL_THEME = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
};

function parseControlMessage(data: string): TerminalControlMessage | null {
  try {
    const parsed = JSON.parse(data) as Partial<TerminalControlMessage>;
    if (parsed.source === 'claudetree' && parsed.type === 'error' && typeof parsed.message === 'string') {
      return parsed as TerminalControlMessage;
    }
  } catch {
    // Terminal output is plain text, so most messages are not JSON.
  }

  return null;
}

function writeTerminalNotice(term: Terminal, message: string): void {
  term.write(`\r\n[${message}]\r\n`);
}

function sendTerminalResize(ws: WebSocket, cols: number, rows: number): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}

export function useTerminal(worktreeId: string | null, container: HTMLDivElement | null): TerminalRefs {
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!worktreeId) {
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    if (!container) {
      setStatus('connecting');
      setErrorMessage(null);
      return;
    }

    let disposed = false;
    setStatus('connecting');
    setErrorMessage(null);

    const term = new Terminal({
      theme: TERMINAL_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${worktreeId}`);
    wsRef.current = ws;

    const setTerminalError = (message: string) => {
      if (disposed) {
        return;
      }

      setStatus('error');
      setErrorMessage(message);
    };

    ws.onopen = () => {
      if (disposed) {
        return;
      }

      setStatus('connected');
      sendTerminalResize(ws, term.cols, term.rows);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      const controlMessage = parseControlMessage(event.data);
      if (controlMessage) {
        setTerminalError(controlMessage.message);
        writeTerminalNotice(term, controlMessage.message);
        return;
      }

      term.write(event.data);
    };

    ws.onerror = () => {
      setTerminalError('Terminal connection failed.');
    };

    ws.onclose = (event) => {
      if (disposed) {
        return;
      }

      if (event.code !== 1000) {
        const closeReason = event.reason || 'Terminal session ended unexpectedly.';
        setTerminalError(closeReason);
        writeTerminalNotice(term, closeReason);
        return;
      }

      setStatus('idle');
      writeTerminalNotice(term, 'Session ended');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    term.onResize(({ cols, rows }) => {
      sendTerminalResize(ws, cols, rows);
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [container, worktreeId]);

  return { termRef, wsRef, status, errorMessage };
}
