import { useState, useEffect } from 'react';
import type { SessionStatus, PipelineStatus } from '@/types';

interface StatusPayload {
  sessions: Record<string, SessionStatus>;
  pipelines: Record<string, PipelineStatus>;
}

export function useWorktreeStatuses(): {
  sessions: Map<string, SessionStatus>;
  pipelines: Map<string, PipelineStatus>;
} {
  const [sessions, setSessions] = useState<Map<string, SessionStatus>>(new Map());
  const [pipelines, setPipelines] = useState<Map<string, PipelineStatus>>(new Map());

  useEffect(() => {
    const eventSource = new EventSource('/api/status/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StatusPayload;
        setSessions(new Map(Object.entries(data.sessions)));
        setPipelines(new Map(Object.entries(data.pipelines)));
      } catch {
        // Ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects natively
    };

    return () => eventSource.close();
  }, []);

  return { sessions, pipelines };
}
