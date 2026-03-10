import { useState, useEffect } from 'react';
import type { SessionStatus } from '@/types';

export function useWorktreeStatuses(): Map<string, SessionStatus> {
  const [statuses, setStatuses] = useState<Map<string, SessionStatus>>(new Map());

  useEffect(() => {
    const eventSource = new EventSource('/api/status/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, SessionStatus>;
        setStatuses(new Map(Object.entries(data)));
      } catch {
        // Ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects natively
    };

    return () => eventSource.close();
  }, []);

  return statuses;
}
