import { useState } from 'react';
import { useTerminal, type TerminalStatus } from '@/hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  worktreeId: string | null;
  onExit?: () => void;
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

export function TerminalView({ worktreeId, onExit }: TerminalProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { status, errorMessage } = useTerminal(worktreeId, container, onExit);

  if (!worktreeId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a worktree to open a terminal
      </div>
    );
  }

  const statusMessage = getStatusMessage(status, errorMessage);

  return (
    <div className="relative flex-1 min-h-0 p-1">
      <div className="h-full w-full" ref={setContainer} />
      {statusMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-background/90 text-muted-foreground text-sm text-center">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
