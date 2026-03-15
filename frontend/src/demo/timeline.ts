/**
 * Demo timeline — 8-step slideshow.
 *
 * Slides:
 *  0. idle             — Existing worktrees visible, no action
 *  1. new-worktree     — Opens modal, fills form, creates worktree, shows ticket
 *  2. development      — Claude Code terminal plays scripted implementation
 *  3. review           — Narrative analysis view
 *  4. fix-ci           — PR with failing tests → terminal auto-fixes
 *  5. address-comments — Terminal addresses reviewer suggestion
 *  6. approved         — All tests pass, all reviewers approve
 *  7. merged           — Celebration screen
 */
import {
  createSessionStatus,
  createPRWatcherStatus,
  DEMO_WORKTREE,
  DEMO_PR_DETAILS_FAILING,
  DEMO_PR_DETAILS_SUGGESTION,
  DEMO_PR_DETAILS_PASSING,
} from './mock-data';
import {
  setDemoSessions,
  setDemoPRWatchers,
  flushSSE,
} from './mock-sse';
import { markWorktreeCreated, setDemoPRDetails, resetDemoPRDetails } from './mock-api';
import { setDemoTerminalScript, destroyDemoTerminals } from './mock-websocket';
import { clearPRDetailsCache } from '@/hooks/usePRDetails';
import type { DemoModalValues } from '@/components/NewWorktreeModal';

export type DemoPhase =
  | 'idle'
  | 'new-worktree'
  | 'development'
  | 'review'
  | 'fix-ci'
  | 'address-comments'
  | 'approved'
  | 'merged';

export const DEMO_PHASES: DemoPhase[] = [
  'idle',
  'new-worktree',
  'development',
  'review',
  'fix-ci',
  'address-comments',
  'approved',
  'merged',
];

export const PHASE_LABELS: Record<DemoPhase, string> = {
  'idle': 'Overview',
  'new-worktree': 'New Worktree',
  'development': 'Development',
  'review': 'Code Review',
  'fix-ci': 'Fix CI',
  'address-comments': 'Address Comments',
  'approved': 'Approved',
  'merged': 'Merged',
};

export interface SlideCallbacks {
  createWorktree: (name: string, linearIssueId?: string, baseBranch?: string) => Promise<void>;
  goToStep: (step: 'dev' | 'review' | 'pr' | 'merged') => void;
  refreshWorktrees: () => void;
  openNewWorktreeModal: () => void;
  closeNewWorktreeModal: () => void;
  setModalFormValues: (values: DemoModalValues) => void;
  destroyTerminalSession: (worktreeId: string) => void;
}

let timers: ReturnType<typeof setTimeout>[] = [];

function scheduleTimer(fn: () => void, ms: number) {
  const t = setTimeout(fn, ms);
  timers.push(t);
  return t;
}

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

/**
 * Execute the actions for entering a specific slide.
 */
export function enterSlide(phase: DemoPhase, cbs: SlideCallbacks) {
  clearTimers();

  switch (phase) {
    case 'idle': {
      // Show existing worktrees, no action
      resetDemoPRDetails();
      setDemoSessions({
        'demo-wt-auth': createSessionStatus('active', 'Refactoring auth middleware'),
        'demo-wt-dashboard': createSessionStatus('idle'),
      });
      setDemoPRWatchers({});
      flushSSE();
      cbs.closeNewWorktreeModal();
      cbs.goToStep('dev');
      break;
    }

    case 'new-worktree': {
      // Open modal and fill form — no auto-submit, user presses Next to proceed
      setDemoTerminalScript('none');
      cbs.openNewWorktreeModal();

      // Fill form after modal renders
      scheduleTimer(() => {
        cbs.setModalFormValues({
          name: 'redis-cache-server',
          linearIssueId: 'ENG-847',
        });
      }, 400);
      break;
    }

    case 'development': {
      // Create worktree, close modal, start Claude Code terminal
      cbs.closeNewWorktreeModal();
      destroyDemoTerminals();
      setDemoTerminalScript('dev');

      markWorktreeCreated();
      cbs.createWorktree(
        DEMO_WORKTREE.name,
        DEMO_WORKTREE.linearIssueId,
        'staging',
      ).then(() => {
        cbs.destroyTerminalSession(DEMO_WORKTREE.id);
        setDemoSessions({
          'demo-wt-auth': createSessionStatus('idle'),
          'demo-wt-dashboard': createSessionStatus('idle'),
          [DEMO_WORKTREE.id]: createSessionStatus('active', 'Implementing Redis cache server'),
        });
        flushSSE();
      });
      cbs.goToStep('dev');
      break;
    }

    case 'review': {
      // Session exited, narrative analysis
      destroyDemoTerminals();
      resetDemoPRDetails();
      setDemoSessions({
        'demo-wt-auth': createSessionStatus('idle'),
        'demo-wt-dashboard': createSessionStatus('idle'),
        [DEMO_WORKTREE.id]: createSessionStatus('exited'),
      });
      flushSSE();
      cbs.goToStep('review');
      break;
    }

    case 'fix-ci': {
      // PR with failing unit tests → terminal auto-fixes
      destroyDemoTerminals();
      cbs.destroyTerminalSession(DEMO_WORKTREE.id);
      setDemoTerminalScript('ci-fix');
      setDemoPRDetails(DEMO_PR_DETAILS_FAILING);
      clearPRDetailsCache(DEMO_WORKTREE.id);
      setDemoPRWatchers({
        [DEMO_WORKTREE.id]: createPRWatcherStatus('fixing', {
          prNumber: 142,
          prUrl: 'https://github.com/platform-eng/claudetree/pull/142',
          prTitle: 'feat: implement Redis cache server with connection pooling',
          reviewDecision: 'CHANGES_REQUESTED',
          ciStatus: 'failing',
          fixAttempt: 1,
          notifications: [
            {
              id: 'n-ci-fail',
              type: 'ci_failed',
              message: 'Unit Tests failed',
              timestamp: Date.now(),
              dismissed: false,
            },
          ],
        }),
      });
      flushSSE();
      cbs.goToStep('pr');
      break;
    }

    case 'address-comments': {
      // Address reviewer suggestion via terminal
      destroyDemoTerminals();
      cbs.destroyTerminalSession(DEMO_WORKTREE.id);
      setDemoTerminalScript('address-review');
      setDemoPRDetails(DEMO_PR_DETAILS_SUGGESTION);
      clearPRDetailsCache(DEMO_WORKTREE.id);
      setDemoPRWatchers({
        [DEMO_WORKTREE.id]: createPRWatcherStatus('watching', {
          prNumber: 142,
          prUrl: 'https://github.com/platform-eng/claudetree/pull/142',
          prTitle: 'feat: implement Redis cache server with connection pooling',
          reviewDecision: 'CHANGES_REQUESTED',
          ciStatus: 'passing',
        }),
      });
      flushSSE();
      cbs.goToStep('pr');
      break;
    }

    case 'approved': {
      // All tests pass, both reviewers approve
      destroyDemoTerminals();
      cbs.destroyTerminalSession(DEMO_WORKTREE.id);
      setDemoPRDetails(DEMO_PR_DETAILS_PASSING);
      clearPRDetailsCache(DEMO_WORKTREE.id);
      setDemoPRWatchers({
        [DEMO_WORKTREE.id]: createPRWatcherStatus('watching', {
          prNumber: 142,
          prUrl: 'https://github.com/platform-eng/claudetree/pull/142',
          prTitle: 'feat: implement Redis cache server with connection pooling',
          reviewDecision: 'APPROVED',
          ciStatus: 'passing',
          notifications: [
            {
              id: 'n-approved',
              type: 'new_review',
              message: 'Mike Rodriguez approved',
              timestamp: Date.now(),
              dismissed: false,
            },
          ],
        }),
      });
      flushSSE();
      cbs.goToStep('pr');
      break;
    }

    case 'merged': {
      // PR merged celebration
      destroyDemoTerminals();
      setDemoPRWatchers({
        [DEMO_WORKTREE.id]: createPRWatcherStatus('stopped', {
          prNumber: 142,
          prUrl: 'https://github.com/platform-eng/claudetree/pull/142',
          prTitle: 'feat: implement Redis cache server with connection pooling',
          reviewDecision: 'APPROVED',
          ciStatus: 'passing',
          notifications: [
            {
              id: 'n-merged',
              type: 'pr_merged',
              message: 'PR #142 was merged',
              timestamp: Date.now(),
              dismissed: false,
              meta: {
                mergedBy: 'Sarah Kim',
                mergedAt: new Date().toISOString(),
                baseBranch: 'staging',
                commitCount: 6,
              },
            },
          ],
        }),
      });
      flushSSE();

      scheduleTimer(() => {
        cbs.goToStep('merged');
      }, 200);
      break;
    }
  }
}

export function cleanupSlide() {
  clearTimers();
}
