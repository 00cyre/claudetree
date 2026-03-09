import { useState } from 'react';
import { useTerminal, type TerminalStatus } from '../hooks/useTerminal.js';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  worktreeId: string | null;
}

function getStatusMessage(status: TerminalStatus, errorMessage: string | null): string | null {
  if (status === 'error') {
    return errorMessage ?? 'Terminal unavailable.';
  }

  if (status === 'connecting') {
    return 'Connecting to terminal...';
  }

  return null;
}

export function TerminalView({ worktreeId }: TerminalProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { status, errorMessage } = useTerminal(worktreeId, container);

  if (!worktreeId) {
    return <div className="terminal-placeholder">Select a worktree to open a terminal</div>;
  }

  const statusMessage = getStatusMessage(status, errorMessage);

  return (
    <div className="terminal-shell">
      <div className="terminal-container" ref={setContainer} />
      {statusMessage ? <div className="terminal-status">{statusMessage}</div> : null}
    </div>
  );
}
