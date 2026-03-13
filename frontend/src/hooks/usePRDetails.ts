import { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import type { PRDetailedData } from '@/types';

interface CacheEntry {
  data: PRDetailedData;
  fetchedAt: number;
}

// Module-level cache that persists across mounts/unmounts
const cache = new Map<string, CacheEntry>();

const STALE_THRESHOLD_MS = 30_000; // Consider data stale after 30s
const REFRESH_DELAY_MS = 3_000; // Wait 3s after mount before background refresh
const POLL_INTERVAL_MS = 60_000; // Poll every 60s for ongoing updates
const SETTLE_MS = 400; // Debounce rapid worktree switches

export function usePRDetails(worktreeId: string) {
  const cached = cache.get(worktreeId);
  const [data, setData] = useState<PRDetailedData | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worktreeIdRef = useRef(worktreeId);
  worktreeIdRef.current = worktreeId;

  useEffect(() => {
    // Show cached data immediately
    const entry = cache.get(worktreeId);
    if (entry) {
      setData(entry.data);
      setLoading(false);
      setError(null);
    } else {
      setData(null);
      setLoading(true);
      setError(null);
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchData(isBackground: boolean) {
      if (cancelled) return;

      if (isBackground) {
        setRefreshing(true);
      }

      try {
        const result = await api.getPRDetails(worktreeId);
        if (cancelled) return;

        cache.set(worktreeId, { data: result, fetchedAt: Date.now() });
        setData(result);
        setError(null);
        setLoading(false);
        setRefreshing(false);
      } catch (err) {
        if (cancelled) return;
        // On background refresh failure, keep showing cached data
        if (isBackground) {
          setRefreshing(false);
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        setRefreshing(false);
      }
    }

    // Debounce: wait for user to settle on this worktree
    settleTimer = setTimeout(() => {
      if (cancelled) return;

      const isStale = !entry || (Date.now() - entry.fetchedAt > STALE_THRESHOLD_MS);

      if (!entry) {
        // No cache — fetch immediately (loading skeleton is showing)
        fetchData(false);
      } else if (isStale) {
        // Cache exists but stale — background refresh
        fetchData(true);
      } else {
        // Fresh cache — schedule a delayed refresh
        refreshTimer = setTimeout(() => {
          if (!cancelled) fetchData(true);
        }, REFRESH_DELAY_MS);
      }

      // Start polling for ongoing updates
      pollTimer = setInterval(() => {
        if (!cancelled) fetchData(true);
      }, POLL_INTERVAL_MS);
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      if (settleTimer) clearTimeout(settleTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [worktreeId]);

  return { data, loading, refreshing, error };
}
