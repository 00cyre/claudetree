import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import {
  attachSession,
  detachSession,
  onStatusChange,
  onExit,
  getOrCreateSession,
  type TerminalStatus,
} from '@/lib/terminal-sessions';

export type { TerminalStatus };

type TerminalRefs = {
  status: TerminalStatus;
  errorMessage: string | null;
};

export function useTerminal(worktreeId: string | null, container: HTMLDivElement | null, onExitCb?: () => void): TerminalRefs {
  const onExitRef = useRef(onExitCb);
  onExitRef.current = onExitCb;
  const [status, setStatus] = useState<TerminalStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

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

    // Attach existing or new session to this container
    const session = attachSession(worktreeId, container);
    fitAddonRef.current = session.fitAddon;

    // Sync initial state
    setStatus(session.status);
    setErrorMessage(session.errorMessage);

    // Listen for status changes while mounted
    const unsubStatus = onStatusChange(worktreeId, (s, err) => {
      setStatus(s);
      setErrorMessage(err);
    });

    const unsubExit = onExit(worktreeId, () => {
      onExitRef.current?.();
    });

    // Resize handling
    const handleResize = () => session.fitAddon.fit();
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      session.fitAddon.fit();
    });
    resizeObserver.observe(container);

    return () => {
      unsubStatus();
      unsubExit();
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      // Detach but keep session alive
      detachSession(worktreeId);
      fitAddonRef.current = null;
    };
  }, [container, worktreeId]);

  return { status, errorMessage };
}
