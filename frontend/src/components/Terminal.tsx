import { useRef } from 'react';
import { useTerminal } from '../hooks/useTerminal.js';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  worktreeId: string | null;
}

export function TerminalView({ worktreeId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useTerminal(worktreeId, containerRef);

  if (!worktreeId) {
    return <div className="terminal-placeholder">Select a worktree to open a terminal</div>;
  }

  return <div className="terminal-container" ref={containerRef} />;
}
