import { useState, useEffect } from 'react';
import type { SessionStatus, PipelineStatus, PRWatcherStatus } from '@/types';

interface StatusPayload {
  sessions: Record<string, SessionStatus>;
  pipelines: Record<string, PipelineStatus>;
  prWatchers: Record<string, PRWatcherStatus>;
}

export function useWorktreeStatuses(): {
  sessions: Map<string, SessionStatus>;
  pipelines: Map<string, PipelineStatus>;
  prWatchers: Map<string, PRWatcherStatus>;
} {
  const [sessions, setSessions] = useState<Map<string, SessionStatus>>(new Map());
  const [pipelines, setPipelines] = useState<Map<string, PipelineStatus>>(new Map());
  const [prWatchers, setPRWatchers] = useState<Map<string, PRWatcherStatus>>(new Map());

  useEffect(() => {
    const eventSource = new EventSource('/api/status/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StatusPayload;
        setSessions(new Map(Object.entries(data.sessions)));
        setPipelines(new Map(Object.entries(data.pipelines)));
        if (data.prWatchers) {
          setPRWatchers(new Map(Object.entries(data.prWatchers)));
        }
      } catch {
        // Ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects natively
    };

    return () => eventSource.close();
  }, []);

  return { sessions, pipelines, prWatchers };
}
