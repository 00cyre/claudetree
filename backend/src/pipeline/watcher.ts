import { execFile } from 'child_process';
import { promisify } from 'util';
import { fetchFailedLogs, sendFixPrompt, watchForIdle } from './ci-fix.js';

const execFileAsync = promisify(execFile);

export type PipelinePhase =
  | 'idle'
  | 'watching'
  | 'passing'
  | 'failing'
  | 'fixing'
  | 'error';

export interface PipelineStatus {
  phase: PipelinePhase;
  message: string;
  since: number;
  failedChecks?: string[];
  fixAttempt?: number;
  maxAttempts: number;
  autofixSessionId?: string;
}

const POLL_INTERVAL_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;

class PipelineWatcher {
  private status: PipelineStatus;
  private pollInterval: NodeJS.Timeout | null = null;
  private idleCleanup: (() => void) | null = null;
  private worktreeId: string;
  private worktreePath: string;
  private branch: string;

  constructor(worktreeId: string, worktreePath: string, branch: string) {
    this.worktreeId = worktreeId;
    this.worktreePath = worktreePath;
    this.branch = branch;
    this.status = {
      phase: 'idle',
      message: 'Pipeline watcher inactive',
      since: Date.now(),
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      fixAttempt: 0,
    };
  }

  enable(): void {
    this.setPhase('watching', 'Watching CI checks...');
    this.startPolling();
  }

  disable(): void {
    this.stopPolling();
    this.stopIdleCheck();
    this.setPhase('idle', 'Pipeline watcher inactive');
    this.status.fixAttempt = 0;
    this.status.autofixSessionId = undefined;
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.poll();
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private stopIdleCheck(): void {
    if (this.idleCleanup) {
      this.idleCleanup();
      this.idleCleanup = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.status.phase !== 'watching') return;

    try {
      const { stdout } = await execFileAsync('gh', [
        'run', 'list',
        '--branch', this.branch,
        '--limit', '1',
        '--json', 'databaseId,status,conclusion,name,event',
      ], { cwd: this.worktreePath });

      const runs = JSON.parse(stdout) as Array<{
        databaseId: number;
        status: string;
        conclusion: string;
        name: string;
        event: string;
      }>;

      if (runs.length === 0) return;

      const run = runs[0];

      if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          this.stopPolling();
          this.setPhase('passing', 'All CI checks passed');
        } else {
          this.stopPolling();
          this.setPhase('failing', `CI check "${run.name}" failed`);
          this.status.failedChecks = [run.name];
          await this.handleFailure(run.databaseId);
        }
      } else if (run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting' || run.status === 'pending') {
        this.setPhase('watching', `CI running: ${run.name} (${run.status})`);
      }
    } catch (err) {
      console.error(`Pipeline poll error for ${this.worktreeId}:`, err);
    }
  }

  private async handleFailure(runId: number): Promise<void> {
    const attempt = (this.status.fixAttempt ?? 0) + 1;
    this.status.fixAttempt = attempt;

    if (attempt > this.status.maxAttempts) {
      this.stopPolling();
      this.setPhase('error', `Max fix attempts (${this.status.maxAttempts}) reached`);
      return;
    }

    const logs = await fetchFailedLogs(this.worktreePath, runId);

    if (!logs.trim()) {
      this.setPhase('error', 'CI failed but no logs found');
      return;
    }

    // Creates a new autofix terminal tab with Claude Code
    const sessionId = sendFixPrompt(this.worktreeId, logs, attempt, this.status.maxAttempts);
    if (!sessionId) {
      this.setPhase('error', 'Failed to create autofix session');
      return;
    }

    this.status.autofixSessionId = sessionId;
    this.setPhase('fixing', `Fix attempt ${attempt}/${this.status.maxAttempts} — see autofix tab`);

    // Watch the autofix session for idle (Claude done fixing)
    this.startIdleWatch(sessionId);
  }

  private startIdleWatch(sessionId: string): void {
    this.stopIdleCheck();
    this.idleCleanup = watchForIdle(sessionId, () => {
      // Claude finished fixing. Go back to watching CI.
      // User pushes manually.
      this.setPhase('watching', 'Autofix complete — push when ready, then CI will re-run');
      this.startPolling();
    });
  }

  getStatus(): PipelineStatus {
    return { ...this.status };
  }

  private setPhase(phase: PipelinePhase, message: string): void {
    this.status.phase = phase;
    this.status.message = message;
    this.status.since = Date.now();
  }
}

// Singleton manager
const watchers = new Map<string, PipelineWatcher>();

export function enablePipeline(worktreeId: string, worktreePath: string, branch: string): PipelineStatus {
  let watcher = watchers.get(worktreeId);
  if (!watcher) {
    watcher = new PipelineWatcher(worktreeId, worktreePath, branch);
    watchers.set(worktreeId, watcher);
  }
  watcher.enable();
  return watcher.getStatus();
}

export function disablePipeline(worktreeId: string): void {
  const watcher = watchers.get(worktreeId);
  if (watcher) {
    watcher.disable();
  }
}

export function getPipelineStatus(worktreeId: string): PipelineStatus | null {
  const watcher = watchers.get(worktreeId);
  return watcher ? watcher.getStatus() : null;
}

export function getAllPipelineStatuses(): Record<string, PipelineStatus> {
  const result: Record<string, PipelineStatus> = {};
  for (const [id, watcher] of watchers) {
    result[id] = watcher.getStatus();
  }
  return result;
}
