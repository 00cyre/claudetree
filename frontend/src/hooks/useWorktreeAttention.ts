import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionStatus, PRWatcherStatus, AttentionState } from '@/types';
import { deriveDevStep } from '@/hooks/useDevStepper';

export function useWorktreeAttention(
  sessions: Map<string, SessionStatus>,
  prWatchers: Map<string, PRWatcherStatus>,
  selectedWorktreeId: string | undefined,
) {
  const [attention, setAttention] = useState<Map<string, AttentionState>>(new Map());
  const prevSessionsRef = useRef<Map<string, SessionStatus> | null>(null);
  const prevPRWatchersRef = useRef<Map<string, PRWatcherStatus> | null>(null);

  // Detect transitions
  useEffect(() => {
    const prevSessions = prevSessionsRef.current;
    const prevPRWatchers = prevPRWatchersRef.current;

    // Store current as previous for next run
    prevSessionsRef.current = sessions;
    prevPRWatchersRef.current = prWatchers;

    // Skip first payload (baseline — no false positives on load)
    if (!prevSessions || !prevPRWatchers) return;

    // Collect all worktree IDs
    const allIds = new Set([...sessions.keys(), ...prWatchers.keys()]);

    setAttention(prev => {
      let next = prev;
      let changed = false;

      for (const id of allIds) {
        const prWatcher = prWatchers.get(id);
        const derivedStep = deriveDevStep(prWatcher);

        // Merged → remove any existing attention
        if (derivedStep === 'merged') {
          if (next.has(id)) {
            if (!changed) { next = new Map(next); changed = true; }
            next.delete(id);
          }
          continue;
        }

        // Don't set attention on the currently selected worktree
        if (id === selectedWorktreeId) continue;

        const prevSession = prevSessions.get(id);
        const currSession = sessions.get(id);
        const prevPR = prevPRWatchers.get(id);
        const currPR = prWatchers.get(id);

        // Session active → idle: amber
        if (prevSession?.state === 'active' && currSession?.state === 'idle') {
          if (!changed) { next = new Map(next); changed = true; }
          next.set(id, { color: 'amber', reason: 'Claude finished working', timestamp: Date.now() });
          continue; // amber wins, skip CI checks for this ID
        }

        // CI transitions
        if (prevPR && currPR) {
          // CI → failing: amber
          if (prevPR.ciStatus !== 'failing' && currPR.ciStatus === 'failing') {
            if (!changed) { next = new Map(next); changed = true; }
            next.set(id, { color: 'amber', reason: 'CI failed', timestamp: Date.now() });
            continue;
          }

          // CI → passing: emerald (only if no amber already set)
          if (prevPR.ciStatus !== 'passing' && currPR.ciStatus === 'passing') {
            const existing = next.get(id);
            if (!existing || existing.color !== 'amber') {
              if (!changed) { next = new Map(next); changed = true; }
              next.set(id, { color: 'emerald', reason: 'CI passed', timestamp: Date.now() });
            }
          }
        }
      }

      return changed ? next : prev;
    });
  }, [sessions, prWatchers, selectedWorktreeId]);

  // Auto-clear on selection
  useEffect(() => {
    if (!selectedWorktreeId) return;
    setAttention(prev => {
      if (!prev.has(selectedWorktreeId)) return prev;
      const next = new Map(prev);
      next.delete(selectedWorktreeId);
      return next;
    });
  }, [selectedWorktreeId]);

  const clearAttention = useCallback((id: string) => {
    setAttention(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { attention, clearAttention };
}
