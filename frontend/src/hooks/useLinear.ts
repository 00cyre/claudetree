import { useState, useEffect, useCallback } from 'react';
import type { LinearIssue, LinearStatus, Worktree } from '../types/index.js';
import { api } from '../api/client.js';
import { extractTicketIdFromBranch } from '../utils/linear.js';

export function useLinear(selectedWorktree: Worktree | null) {
  const [status, setStatus] = useState<LinearStatus>({
    configured: false,
    connected: false,
    status: 'disconnected',
  });
  const [issue, setIssue] = useState<LinearIssue | null>(null);
  const [loadingIssue, setLoadingIssue] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getLinearStatus();
      setStatus(s);
    } catch {
      // Backend may not be running yet
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Effective ticket ID: manual link or extracted from branch name (e.g. atl-4096-foo → atl-4096)
  const effectiveTicketId =
    selectedWorktree?.linearIssueId ?? (selectedWorktree?.name ? extractTicketIdFromBranch(selectedWorktree.name) : null);

  useEffect(() => {
    if (!effectiveTicketId) {
      setIssue(null);
      setIssueError(null);
      return;
    }

    let cancelled = false;
    setLoadingIssue(true);
    setIssueError(null);

    api.getLinearIssue(effectiveTicketId)
      .then((data) => {
        if (!cancelled) {
          setIssue(data);
          setIssueError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setIssue(null);
          setIssueError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingIssue(false);
      });

    return () => { cancelled = true; };
  }, [effectiveTicketId]);

  const setupLinear = async (apiKey: string) => {
    await api.setupLinear(apiKey);
    await refreshStatus();
  };

  return { status, issue, loadingIssue, issueError, effectiveTicketId, setupLinear, refreshStatus };
}
