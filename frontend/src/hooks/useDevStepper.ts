import { useState, useCallback, useEffect, useRef } from 'react';
import type { DevStep, PRWatcherStatus } from '@/types';

const STEPS: DevStep[] = ['dev', 'review', 'pr', 'merged'];
const OVERRIDES_KEY = 'claudetree:stepOverrides';

function loadOverrides(): Map<string, DevStep> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)) as [string, DevStep][]);
  } catch { return new Map(); }
}

function saveOverrides(overrides: Map<string, DevStep>): void {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(Object.fromEntries(overrides)));
  } catch { /* ignore */ }
}

export function deriveDevStep(
  prWatcherStatus: PRWatcherStatus | null | undefined,
): DevStep {
  if (!prWatcherStatus) return 'dev';

  const { phase, notifications } = prWatcherStatus;

  // Merged: stopped with pr_merged notification
  if (phase === 'stopped' && notifications.some(n => n.type === 'pr_merged')) {
    return 'merged';
  }

  // PR: actively watching or fixing
  if (phase === 'watching' || phase === 'ci_failing' || phase === 'fixing' || phase === 'pushing_fix') {
    return 'pr';
  }

  // Review is never auto-derived — user navigates there manually
  // or terminal exit handler triggers goToStep('review')
  return 'dev';
}

/** Which steps are reachable given the current PR watcher state */
export function reachableSteps(prWatcherStatus: PRWatcherStatus | null | undefined): Set<DevStep> {
  if (prWatcherStatus) {
    const isMerged = prWatcherStatus.phase === 'stopped'
      && prWatcherStatus.notifications.some(n => n.type === 'pr_merged');

    if (isMerged) {
      return new Set<DevStep>(['merged']);
    }
  }

  // PR step is always navigable — PRReviewPanel fetches data independently
  // and shows "No PR data" if none exists
  return new Set<DevStep>(['dev', 'review', 'pr']);
}

export function useDevStepper(
  worktreeId: string | undefined,
  prWatcherStatus: PRWatcherStatus | null | undefined,
) {
  const autoStep = deriveDevStep(prWatcherStatus);
  const reachable = reachableSteps(prWatcherStatus);
  const [overrides, setOverridesRaw] = useState<Map<string, DevStep>>(loadOverrides);
  const setOverrides = useCallback((updater: (prev: Map<string, DevStep>) => Map<string, DevStep>) => {
    setOverridesRaw((prev) => {
      const next = updater(prev);
      saveOverrides(next);
      return next;
    });
  }, []);
  const prevAutoRef = useRef(autoStep);
  const prevWorktreeRef = useRef(worktreeId);

  // Reset override on worktree switch
  useEffect(() => {
    if (worktreeId !== prevWorktreeRef.current) {
      prevWorktreeRef.current = worktreeId;
    }
  }, [worktreeId]);

  // Auto-clear override when system advances past it or when merged
  useEffect(() => {
    if (!worktreeId) return;
    const prevAuto = prevAutoRef.current;
    prevAutoRef.current = autoStep;

    const override = overrides.get(worktreeId);
    if (!override) return;

    // If merged, always clear override (locked)
    if (autoStep === 'merged') {
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(worktreeId);
        return next;
      });
      return;
    }

    const autoIdx = STEPS.indexOf(autoStep);
    const overrideIdx = STEPS.indexOf(override);
    const prevAutoIdx = STEPS.indexOf(prevAuto);

    // System advanced past override
    if (autoIdx > prevAutoIdx && autoIdx > overrideIdx) {
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(worktreeId);
        return next;
      });
    }
  }, [autoStep, worktreeId, overrides]);

  const currentStep = (worktreeId && overrides.get(worktreeId)) || autoStep;

  const goToStep = useCallback((step: DevStep) => {
    if (!worktreeId) return;
    // Enforce navigation guards
    if (!reachable.has(step)) return;
    if (step === autoStep) {
      setOverrides(prev => {
        const next = new Map(prev);
        next.delete(worktreeId);
        return next;
      });
    } else {
      setOverrides(prev => new Map(prev).set(worktreeId, step));
    }
  }, [worktreeId, autoStep, reachable]);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) goToStep(STEPS[idx + 1]);
  }, [currentStep, goToStep]);

  const goPrev = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) goToStep(STEPS[idx - 1]);
  }, [currentStep, goToStep]);

  return { currentStep, autoStep, reachable, goToStep, goNext, goPrev, overrides };
}
