/**
 * Overrides the `api` object methods directly with mock implementations.
 * This bypasses fetch/proxy/SES entirely — no monkey-patching globals.
 */
import { api } from '@/api/client';
import {
  DEMO_PROJECT,
  DEMO_WORKTREE,
  DEMO_WORKTREES_EXISTING,
  DEMO_LINEAR_STATUS,
  DEMO_AI_STATUS,
  DEMO_ISSUE,
  DEMO_COMMENTS,
  DEMO_FLAGS,
  DEMO_PR_DETAILS,
  DEMO_NARRATIVE,
  DEMO_BRANCH_DIFF,
} from './mock-data';

import type { PRDetailedData } from '@/types';

// Keep originals for restore
const originalMethods: Record<string, unknown> = {};
let installed = false;
let worktreeCreated = false;
let prDetailsOverride: PRDetailedData | null = null;

export function setDemoPRDetails(data: PRDetailedData) {
  prDetailsOverride = data;
}

export function resetDemoPRDetails() {
  prDetailsOverride = null;
}

export function markWorktreeCreated() {
  worktreeCreated = true;
}

export function resetMockApi() {
  worktreeCreated = false;
  prDetailsOverride = null;
}

function delay(ms = 80): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function installMockApi() {
  if (installed) return;
  installed = true;

  // Save originals
  for (const key of Object.keys(api)) {
    originalMethods[key] = (api as Record<string, unknown>)[key];
  }

  // Projects
  api.getProjects = async () => { await delay(); return [DEMO_PROJECT]; };
  api.addProject = async () => { await delay(); return DEMO_PROJECT; };

  // Branches
  api.getBranches = async () => {
    await delay();
    return ['main', 'staging', 'dev', 'feat/ENG-812-auth-middleware-v2', 'feat/ENG-831-analytics-dashboard'];
  };

  // Worktrees
  api.getWorktrees = async () => {
    await delay();
    return worktreeCreated
      ? [...DEMO_WORKTREES_EXISTING, DEMO_WORKTREE]
      : DEMO_WORKTREES_EXISTING;
  };
  api.createWorktree = async () => { await delay(); worktreeCreated = true; return DEMO_WORKTREE; };
  api.deleteWorktree = async () => { await delay(); return { ok: true }; };
  api.setWorktreeOrder = async () => { await delay(); return { ok: true }; };
  api.setWorktreeFlags = async () => { await delay(); return { ok: true }; };
  api.linkWorktree = async () => { await delay(); return { ok: true }; };
  api.unlinkWorktree = async () => { await delay(); return { ok: true }; };

  // Flags
  api.getFlags = async () => { await delay(); return DEMO_FLAGS; };
  api.createFlag = async () => { await delay(); return { ok: true }; };
  api.deleteFlag = async () => { await delay(); return { ok: true }; };

  // Linear
  api.getLinearStatus = async () => { await delay(); return DEMO_LINEAR_STATUS; };
  api.getLinearIssue = async () => { await delay(); return DEMO_ISSUE; };
  api.getLinearComments = async () => { await delay(); return DEMO_COMMENTS; };
  api.setupLinear = async () => { await delay(); return { ok: true }; };

  // AI
  api.getAIStatus = async () => { await delay(); return DEMO_AI_STATUS; };
  api.setupAI = async () => { await delay(); return { ok: true }; };

  // Diff & Analysis
  api.analyzeNarrative = async () => { await delay(150); return DEMO_NARRATIVE; };
  api.getBranchDiff = async () => { await delay(); return DEMO_BRANCH_DIFF; };
  api.getDiff = async () => {
    await delay();
    return { branch: 'feat/ENG-847-redis-cache-server', files: DEMO_BRANCH_DIFF.files };
  };
  api.analyzeChanges = async () => {
    await delay();
    return {
      sortOrder: DEMO_BRANCH_DIFF.files.map(f => f.file),
      explanations: Object.fromEntries(DEMO_BRANCH_DIFF.files.map(f => [f.file, `Changes to ${f.file}`])),
      summary: 'Redis cache implementation',
    };
  };
  api.analyzeFile = async (_wt: string, file: string) => {
    await delay();
    return { file, overview: `Detailed analysis of ${file}`, steps: [] };
  };
  api.getFileDiff = async (_wt: string, file: string) => {
    await delay();
    return { file, diff: '' };
  };

  // Pipeline
  api.enablePipeline = async () => {
    await delay();
    return { status: { phase: 'watching' as const, message: 'Watching', since: Date.now(), maxAttempts: 3 } };
  };
  api.disablePipeline = async () => { await delay(); return { ok: true }; };

  // PR Watcher
  api.getPRDetails = async () => { await delay(100); return prDetailsOverride ?? DEMO_PR_DETAILS; };
  api.getPRWatcherStatus = async () => { await delay(); return null; };
  api.dismissPRNotification = async () => { await delay(); return { ok: true }; };

  // Terminal
  api.sendTerminalCommand = async () => { await delay(); return { ok: true }; };

  // Commit
  api.commit = async () => { await delay(); return { ok: true, summary: {} }; };
}

export function uninstallMockApi() {
  if (!installed) return;
  for (const [key, original] of Object.entries(originalMethods)) {
    (api as Record<string, unknown>)[key] = original;
  }
  originalMethods.length = 0;
  installed = false;
}
