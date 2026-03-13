import { execFile } from 'child_process';
import { promisify } from 'util';
import simpleGit from 'simple-git';
import { fetchFailedLogs, sendFixPrompt, watchForIdle } from './ci-fix.js';
import { getPipelineStatus } from './watcher.js';

const execFileAsync = promisify(execFile);

export type PRWatcherPhase =
  | 'discovering'
  | 'watching'
  | 'ci_failing'
  | 'fixing'
  | 'pushing_fix'
  | 'no_pr'
  | 'stopped'
  | 'error';

export type PRNotificationType =
  | 'ci_failed'
  | 'ci_passed'
  | 'autofix_started'
  | 'autofix_pushed'
  | 'autofix_failed'
  | 'new_comment'
  | 'new_review'
  | 'pr_closed'
  | 'pr_merged';

export interface PRNotification {
  id: string;
  type: PRNotificationType;
  message: string;
  timestamp: number;
  dismissed: boolean;
  meta?: Record<string, unknown>;
}

export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'CHANGES_ADDRESSED' | 'REVIEW_REQUIRED';
export type PRCIStatus = 'passing' | 'failing' | 'pending';

export interface PRWatcherStatus {
  phase: PRWatcherPhase;
  message: string;
  since: number;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  fixAttempt: number;
  maxAttempts: number;
  notifications: PRNotification[];
  reviewDecision?: PRReviewDecision;
  ciStatus?: PRCIStatus;
}

const POLL_INTERVAL_MS = 60_000;
const NO_PR_POLL_INTERVAL_MS = 120_000;
const DEFAULT_MAX_ATTEMPTS = 3;

let notifCounter = 0;
function nextNotifId(): string {
  return `prn_${Date.now()}_${++notifCounter}`;
}

export interface PRDetailedData {
  number: number;
  url: string;
  title: string;
  state: string;
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviews: Array<{ login: string; name: string; avatarUrl: string; state: string }>;
  checks: Array<{ name: string; status: string; conclusion: string; detailsUrl?: string; startedAt?: string; completedAt?: string }>;
  comments: Array<{ id: string; body: string; author: { login: string; name?: string; avatarUrl?: string }; createdAt: string; path?: string; line?: number; diffHunk?: string; reviewState?: string }>;
  approvalCount: number;
  commitCount: number;
}

class PRWatcher {
  private status: PRWatcherStatus;
  private pollInterval: NodeJS.Timeout | null = null;
  private idleCleanup: (() => void) | null = null;
  private worktreeId: string;
  private worktreePath: string;
  private branch: string;
  private commentWatermark = 0;
  private reviewWatermark = 0;
  private detailedCache: { data: PRDetailedData; fetchedAt: number } | null = null;
  private static DETAIL_CACHE_TTL = 60_000;

  constructor(worktreeId: string, worktreePath: string, branch: string) {
    this.worktreeId = worktreeId;
    this.worktreePath = worktreePath;
    this.branch = branch;
    this.status = {
      phase: 'stopped',
      message: 'PR watcher inactive',
      since: Date.now(),
      fixAttempt: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      notifications: [],
    };
  }

  async start(): Promise<void> {
    this.setPhase('discovering', 'Discovering PR...');
    await this.discoverPR();
  }

  stop(): void {
    this.stopPolling();
    this.stopIdleCheck();
    this.setPhase('stopped', 'PR watcher inactive');
    this.status.fixAttempt = 0;
  }

  getStatus(): PRWatcherStatus {
    return { ...this.status, notifications: [...this.status.notifications] };
  }

  dismissNotification(notificationId: string): void {
    const notif = this.status.notifications.find((n) => n.id === notificationId);
    if (notif) notif.dismissed = true;
  }

  private computeReviewDecision(
    reviews: Array<{ state: string }>,
    allThreadsResolved?: boolean,
  ): PRReviewDecision | undefined {
    if (reviews.length === 0) return 'REVIEW_REQUIRED';
    const hasChangesRequested = reviews.some(r => r.state === 'CHANGES_REQUESTED');
    if (hasChangesRequested) {
      // If all review threads are resolved, the author has addressed everything
      if (allThreadsResolved) return 'CHANGES_ADDRESSED';
      return 'CHANGES_REQUESTED';
    }
    const hasApproval = reviews.some(r => r.state === 'APPROVED');
    if (hasApproval) return 'APPROVED';
    return 'REVIEW_REQUIRED';
  }

  private async fetchThreadResolution(): Promise<boolean | undefined> {
    if (!this.status.prNumber) return undefined;
    try {
      // Use gh to get repo info then query review threads
      const { stdout: repoStdout } = await execFileAsync('gh', [
        'repo', 'view', '--json', 'owner,name',
      ], { cwd: this.worktreePath });
      const repo = JSON.parse(repoStdout) as { owner: { login: string }; name: string };

      const query = `query($owner:String!,$name:String!,$number:Int!){
        repository(owner:$owner,name:$name){
          pullRequest(number:$number){
            reviewThreads(first:100){
              nodes{ isResolved }
            }
          }
        }
      }`;

      const { stdout } = await execFileAsync('gh', [
        'api', 'graphql',
        '-f', `query=${query}`,
        '-F', `owner=${repo.owner.login}`,
        '-F', `name=${repo.name}`,
        '-F', `number=${this.status.prNumber}`,
      ], { cwd: this.worktreePath });

      const result = JSON.parse(stdout) as {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: Array<{ isResolved: boolean }>;
              };
            };
          };
        };
      };

      const threads = result.data.repository.pullRequest.reviewThreads.nodes;
      if (threads.length === 0) return true; // No threads = nothing unresolved
      return threads.every(t => t.isResolved);
    } catch {
      return undefined; // Can't determine, don't override
    }
  }

  private computeCIStatus(checks?: Array<{ status: string; conclusion: string }>): PRCIStatus | undefined {
    if (!checks || checks.length === 0) return undefined;
    const allDone = checks.every(c => c.status === 'completed' || c.status === 'COMPLETED');
    const hasFailed = checks.some(c => c.conclusion === 'failure');
    if (hasFailed) return 'failing';
    if (allDone) return 'passing';
    return 'pending';
  }

  private async discoverPR(): Promise<void> {
    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'view', this.branch,
        '--json', 'number,url,title,state,statusCheckRollup,comments,reviews,mergedBy,mergedAt,baseRefName,commits',
      ], { cwd: this.worktreePath });

      const pr = JSON.parse(stdout) as {
        number: number;
        url: string;
        title: string;
        state: string;
        statusCheckRollup?: Array<{ conclusion: string; status: string; name: string; detailsUrl?: string }>;
        comments: Array<{ createdAt: string }>;
        reviews: Array<{ createdAt: string; state: string }>;
        mergedBy?: { login: string; name?: string };
        mergedAt?: string;
        baseRefName?: string;
        commits?: Array<{ oid: string }>;
      };

      this.status.prNumber = pr.number;
      this.status.prUrl = pr.url;
      this.status.prTitle = pr.title;

      // Set watermarks to current counts so we only notify on NEW activity
      this.commentWatermark = pr.comments.length;
      this.reviewWatermark = pr.reviews.length;

      if (pr.state === 'CLOSED') {
        this.addNotification('pr_closed', `PR #${pr.number} is closed`);
        this.setPhase('stopped', `PR #${pr.number} is closed`);
        return;
      }
      if (pr.state === 'MERGED') {
        this.addNotification('pr_merged', `PR #${pr.number} was merged`, {
          mergedBy: pr.mergedBy?.name || pr.mergedBy?.login || 'Unknown',
          mergedAt: pr.mergedAt || new Date().toISOString(),
          baseBranch: pr.baseRefName || 'unknown',
          commitCount: pr.commits?.length ?? 0,
        });
        this.setPhase('stopped', `PR #${pr.number} was merged`);
        return;
      }

      const allThreadsResolved = await this.fetchThreadResolution();
      this.status.reviewDecision = this.computeReviewDecision(pr.reviews, allThreadsResolved ?? undefined);
      this.status.ciStatus = this.computeCIStatus(pr.statusCheckRollup);

      this.setPhase('watching', `Watching PR #${pr.number}`);
      this.startPolling(POLL_INTERVAL_MS);
    } catch {
      // No PR found for this branch
      this.setPhase('no_pr', `No PR found for branch "${this.branch}"`);
      this.startPolling(NO_PR_POLL_INTERVAL_MS);
    }
  }

  private startPolling(intervalMs: number): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => this.poll(), intervalMs);
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
    // In no_pr phase, try to discover again
    if (this.status.phase === 'no_pr') {
      try {
        const { stdout } = await execFileAsync('gh', [
          'pr', 'view', this.branch,
          '--json', 'number,url,title,state',
        ], { cwd: this.worktreePath });
        const pr = JSON.parse(stdout) as { number: number; url: string; title: string; state: string };
        this.status.prNumber = pr.number;
        this.status.prUrl = pr.url;
        this.status.prTitle = pr.title;
        this.stopPolling();
        this.setPhase('watching', `Watching PR #${pr.number}`);
        this.commentWatermark = 0;
        this.reviewWatermark = 0;
        this.startPolling(POLL_INTERVAL_MS);
      } catch {
        // Still no PR
      }
      return;
    }

    if (this.status.phase !== 'watching') return;

    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'view', this.branch,
        '--json', 'number,url,title,state,statusCheckRollup,comments,reviews,mergedBy,mergedAt,baseRefName,commits',
      ], { cwd: this.worktreePath });

      const pr = JSON.parse(stdout) as {
        number: number;
        url: string;
        title: string;
        state: string;
        statusCheckRollup?: Array<{ conclusion: string; status: string; name: string; detailsUrl?: string }>;
        comments: Array<{ createdAt: string }>;
        reviews: Array<{ createdAt: string; state: string }>;
        mergedBy?: { login: string; name?: string };
        mergedAt?: string;
        baseRefName?: string;
        commits?: Array<{ oid: string }>;
      };

      // Check if PR was closed/merged
      if (pr.state === 'CLOSED') {
        this.stopPolling();
        this.addNotification('pr_closed', `PR #${pr.number} was closed`);
        this.setPhase('stopped', `PR #${pr.number} was closed`);
        return;
      }
      if (pr.state === 'MERGED') {
        this.stopPolling();
        this.addNotification('pr_merged', `PR #${pr.number} was merged`, {
          mergedBy: pr.mergedBy?.name || pr.mergedBy?.login || 'Unknown',
          mergedAt: pr.mergedAt || new Date().toISOString(),
          baseBranch: pr.baseRefName || 'unknown',
          commitCount: pr.commits?.length ?? 0,
        });
        this.setPhase('stopped', `PR #${pr.number} was merged`);
        return;
      }

      // Update review decision and CI status
      const allThreadsResolved = await this.fetchThreadResolution();
      this.status.reviewDecision = this.computeReviewDecision(pr.reviews, allThreadsResolved ?? undefined);
      this.status.ciStatus = this.computeCIStatus(pr.statusCheckRollup);

      // Check CI status
      if (pr.statusCheckRollup && pr.statusCheckRollup.length > 0) {
        const failed = pr.statusCheckRollup.filter((c) => c.conclusion === 'failure');
        const allDone = pr.statusCheckRollup.every((c) => c.status === 'completed' || c.status === 'COMPLETED');
        const allPassed = allDone && failed.length === 0;

        if (allDone && allPassed) {
          // CI passed - notify but keep watching
          const alreadyNotified = this.status.notifications.some(
            (n) => n.type === 'ci_passed' && Date.now() - n.timestamp < 60_000,
          );
          if (!alreadyNotified) {
            this.addNotification('ci_passed', 'All CI checks passed');
          }
        } else if (failed.length > 0) {
          await this.handleCIFailure(failed[0].name);
        }
      }

      // Check for new comments
      if (pr.comments.length > this.commentWatermark) {
        const newCount = pr.comments.length - this.commentWatermark;
        this.commentWatermark = pr.comments.length;
        this.addNotification(
          'new_comment',
          `${newCount} new comment${newCount > 1 ? 's' : ''} on PR #${pr.number}`,
          { count: newCount },
        );
      }

      // Check for new reviews
      if (pr.reviews.length > this.reviewWatermark) {
        const newCount = pr.reviews.length - this.reviewWatermark;
        this.reviewWatermark = pr.reviews.length;
        this.addNotification(
          'new_review',
          `${newCount} new review${newCount > 1 ? 's' : ''} on PR #${pr.number}`,
          { count: newCount },
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`PR watcher poll error for ${this.worktreeId}:`, err);
      // Back off on rate limit errors
      if (errMsg.includes('rate limit')) {
        this.stopPolling();
        this.startPolling(POLL_INTERVAL_MS * 5);
      }
    }
  }

  private async handleCIFailure(checkName: string): Promise<void> {
    // Guard: don't double-fix if PipelineWatcher is already fixing
    const pipelineStatus = getPipelineStatus(this.worktreeId);
    if (pipelineStatus && pipelineStatus.phase === 'fixing') {
      return;
    }

    const attempt = this.status.fixAttempt + 1;
    this.status.fixAttempt = attempt;

    this.addNotification('ci_failed', `CI check "${checkName}" failed`);

    if (attempt > this.status.maxAttempts) {
      this.stopPolling();
      this.addNotification('autofix_failed', `Max fix attempts (${this.status.maxAttempts}) reached`);
      this.setPhase('error', `Max fix attempts (${this.status.maxAttempts}) reached`);
      return;
    }

    // Find the failed run ID
    let runId: number | null = null;
    try {
      const { stdout } = await execFileAsync('gh', [
        'run', 'list', '--branch', this.branch, '--limit', '1',
        '--json', 'databaseId,status,conclusion',
      ], { cwd: this.worktreePath });
      const runs = JSON.parse(stdout) as Array<{ databaseId: number; status: string; conclusion: string }>;
      if (runs.length > 0 && runs[0].conclusion === 'failure') {
        runId = runs[0].databaseId;
      }
    } catch {
      // Can't find run ID
    }

    if (!runId) {
      this.setPhase('error', 'CI failed but could not find run ID');
      return;
    }

    this.addNotification('autofix_started', `Auto-fix attempt ${attempt}/${this.status.maxAttempts}`);
    this.setPhase('fixing', `Auto-fixing CI (attempt ${attempt}/${this.status.maxAttempts})...`);
    this.stopPolling();

    const logs = await fetchFailedLogs(this.worktreePath, runId);
    if (!logs.trim()) {
      this.setPhase('error', 'CI failed but no logs found');
      return;
    }

    const written = sendFixPrompt(this.worktreeId, logs, attempt, this.status.maxAttempts);
    if (!written) {
      this.setPhase('error', 'Failed to write fix prompt to terminal');
      return;
    }

    this.stopIdleCheck();
    this.idleCleanup = watchForIdle(this.worktreeId, () => {
      this.autoPushFix();
    });
  }

  private async autoPushFix(): Promise<void> {
    this.setPhase('pushing_fix', 'Auto-committing and pushing fix...');

    try {
      const git = simpleGit(this.worktreePath);
      await git.add('-A');
      await git.commit(`fix: auto-fix CI (attempt ${this.status.fixAttempt})`);
      await git.push();

      this.addNotification('autofix_pushed', `Fix pushed (attempt ${this.status.fixAttempt}/${this.status.maxAttempts})`);
      this.setPhase('watching', `Watching PR #${this.status.prNumber}`);
      this.startPolling(POLL_INTERVAL_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If nothing to commit, still push in case there are unpushed commits
      if (msg.includes('nothing to commit') || msg.includes('no changes added')) {
        try {
          const git = simpleGit(this.worktreePath);
          await git.push();
          this.addNotification('autofix_pushed', 'Fix pushed (no new changes to commit)');
          this.setPhase('watching', `Watching PR #${this.status.prNumber}`);
          this.startPolling(POLL_INTERVAL_MS);
        } catch (pushErr) {
          this.addNotification('autofix_failed', `Push failed: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`);
          this.setPhase('error', `Push failed: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`);
        }
      } else {
        this.addNotification('autofix_failed', `Auto-fix failed: ${msg}`);
        this.setPhase('error', `Auto-fix failed: ${msg}`);
      }
    }
  }

  async getDetailedPRData(): Promise<PRDetailedData | null> {
    if (!this.status.prNumber) return null;

    // Return cache if fresh
    if (this.detailedCache && Date.now() - this.detailedCache.fetchedAt < PRWatcher.DETAIL_CACHE_TTL) {
      return this.detailedCache.data;
    }

    try {
      const { stdout: prJson } = await execFileAsync('gh', [
        'pr', 'view', this.branch,
        '--json', 'number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles,statusCheckRollup,comments,reviews,commits,reviewRequests',
      ], { cwd: this.worktreePath });

      const pr = JSON.parse(prJson) as {
        number: number;
        url: string;
        title: string;
        state: string;
        baseRefName: string;
        headRefName: string;
        additions: number;
        deletions: number;
        changedFiles: number;
        statusCheckRollup?: Array<{ name: string; status: string; conclusion: string; detailsUrl?: string; startedAt?: string; completedAt?: string }>;
        comments: Array<{ id?: string; body: string; author: { login: string; name?: string }; createdAt: string }>;
        reviews: Array<{ author: { login: string; name?: string }; state: string; body?: string; createdAt?: string }>;
        commits: Array<{ oid: string }>;
        reviewRequests?: Array<{ login?: string; name?: string }>;
      };

      // Fetch inline review comments
      let inlineComments: Array<{ id: number; body: string; user: { login: string; name?: string; avatar_url?: string }; created_at: string; path?: string; line?: number; diff_hunk?: string; pull_request_review_id?: number }> = [];
      try {
        // Parse owner/repo from the PR URL
        const urlParts = pr.url.match(/github\.com\/([^/]+\/[^/]+)/);
        if (urlParts) {
          const { stdout: commentsJson } = await execFileAsync('gh', [
            'api', `repos/${urlParts[1]}/pulls/${pr.number}/comments`,
            '--paginate',
          ], { cwd: this.worktreePath });
          inlineComments = JSON.parse(commentsJson);
        }
      } catch {
        // Inline comments fetch is best-effort
      }

      // Deduplicate reviews: latest state per author
      const reviewMap = new Map<string, { login: string; name: string; state: string }>();
      for (const r of pr.reviews) {
        const login = r.author.login;
        reviewMap.set(login, {
          login,
          name: r.author.name || login,
          state: r.state,
        });
      }
      // Add pending reviewers from reviewRequests
      if (pr.reviewRequests) {
        for (const rr of pr.reviewRequests) {
          const login = rr.login || rr.name || '';
          if (login && !reviewMap.has(login)) {
            reviewMap.set(login, { login, name: rr.name || login, state: 'PENDING' });
          }
        }
      }

      const reviews = Array.from(reviewMap.values()).map(r => ({
        ...r,
        avatarUrl: `https://github.com/${r.login}.png`,
      }));

      const checks = (pr.statusCheckRollup ?? []).map(c => ({
        name: c.name,
        status: c.status,
        conclusion: c.conclusion || '',
        detailsUrl: c.detailsUrl,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
      }));

      // Map general PR comments
      const generalComments = pr.comments.map((c, i) => ({
        id: c.id ? String(c.id) : `gc_${i}`,
        body: c.body,
        author: {
          login: c.author.login,
          name: c.author.name,
          avatarUrl: `https://github.com/${c.author.login}.png`,
        },
        createdAt: c.createdAt,
      }));

      // Map inline review comments
      const mappedInline = inlineComments.map(c => ({
        id: String(c.id),
        body: c.body,
        author: {
          login: c.user.login,
          name: c.user.name,
          avatarUrl: c.user.avatar_url || `https://github.com/${c.user.login}.png`,
        },
        createdAt: c.created_at,
        path: c.path,
        line: c.line,
        diffHunk: c.diff_hunk,
      }));

      const allComments = [...generalComments, ...mappedInline]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const approvalCount = reviews.filter(r => r.state === 'APPROVED').length;

      const result: PRDetailedData = {
        number: pr.number,
        url: pr.url,
        title: pr.title,
        state: pr.state,
        baseRefName: pr.baseRefName,
        headRefName: pr.headRefName,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
        reviews,
        checks,
        comments: allComments,
        approvalCount,
        commitCount: pr.commits?.length ?? 0,
      };

      this.detailedCache = { data: result, fetchedAt: Date.now() };
      return result;
    } catch (err) {
      console.error(`Failed to fetch detailed PR data for ${this.worktreeId}:`, err);
      return this.detailedCache?.data ?? null;
    }
  }

  private addNotification(type: PRNotificationType, message: string, meta?: Record<string, unknown>): void {
    this.status.notifications.push({
      id: nextNotifId(),
      type,
      message,
      timestamp: Date.now(),
      dismissed: false,
      meta,
    });
    // Keep max 50 notifications
    if (this.status.notifications.length > 50) {
      this.status.notifications = this.status.notifications.slice(-50);
    }
  }

  private setPhase(phase: PRWatcherPhase, message: string): void {
    this.status.phase = phase;
    this.status.message = message;
    this.status.since = Date.now();
  }
}

// Singleton manager
const watchers = new Map<string, PRWatcher>();

export function enablePRWatcher(worktreeId: string, worktreePath: string, branch: string): PRWatcherStatus {
  let watcher = watchers.get(worktreeId);
  if (!watcher) {
    watcher = new PRWatcher(worktreeId, worktreePath, branch);
    watchers.set(worktreeId, watcher);
  }
  watcher.start();
  return watcher.getStatus();
}

export function disablePRWatcher(worktreeId: string): void {
  const watcher = watchers.get(worktreeId);
  if (watcher) {
    watcher.stop();
  }
}

export function getPRWatcherStatus(worktreeId: string): PRWatcherStatus | null {
  const watcher = watchers.get(worktreeId);
  return watcher ? watcher.getStatus() : null;
}

export function getAllPRWatcherStatuses(): Record<string, PRWatcherStatus> {
  const result: Record<string, PRWatcherStatus> = {};
  for (const [id, watcher] of watchers) {
    result[id] = watcher.getStatus();
  }
  return result;
}

export async function getPRDetailedData(worktreeId: string): Promise<PRDetailedData | null> {
  const watcher = watchers.get(worktreeId);
  if (watcher) return watcher.getDetailedPRData();
  return null;
}

/**
 * Fetch PR details on-demand without requiring an active watcher.
 * Used when user navigates to the PR step for a worktree without a running watcher.
 */
export async function fetchPRDetailsOnDemand(worktreePath: string, branch: string): Promise<PRDetailedData | null> {
  try {
    const { stdout: prJson } = await execFileAsync('gh', [
      'pr', 'view', branch,
      '--json', 'number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles,statusCheckRollup,comments,reviews,commits,reviewRequests',
    ], { cwd: worktreePath });

    const pr = JSON.parse(prJson) as {
      number: number;
      url: string;
      title: string;
      state: string;
      baseRefName: string;
      headRefName: string;
      additions: number;
      deletions: number;
      changedFiles: number;
      statusCheckRollup?: Array<{ name: string; status: string; conclusion: string; detailsUrl?: string; startedAt?: string; completedAt?: string }>;
      comments: Array<{ id?: string; body: string; author: { login: string; name?: string }; createdAt: string }>;
      reviews: Array<{ author: { login: string; name?: string }; state: string; body?: string; createdAt?: string }>;
      commits: Array<{ oid: string }>;
      reviewRequests?: Array<{ login?: string; name?: string }>;
    };

    // Fetch inline review comments
    let inlineComments: Array<{ id: number; body: string; user: { login: string; name?: string; avatar_url?: string }; created_at: string; path?: string; line?: number; diff_hunk?: string }> = [];
    try {
      const urlParts = pr.url.match(/github\.com\/([^/]+\/[^/]+)/);
      if (urlParts) {
        const { stdout: commentsJson } = await execFileAsync('gh', [
          'api', `repos/${urlParts[1]}/pulls/${pr.number}/comments`,
          '--paginate',
        ], { cwd: worktreePath });
        inlineComments = JSON.parse(commentsJson);
      }
    } catch {
      // best-effort
    }

    // Deduplicate reviews per author (latest state wins)
    const reviewMap = new Map<string, { login: string; name: string; state: string }>();
    for (const r of pr.reviews) {
      const login = r.author.login;
      reviewMap.set(login, { login, name: r.author.name || login, state: r.state });
    }
    if (pr.reviewRequests) {
      for (const rr of pr.reviewRequests) {
        const login = rr.login || rr.name || '';
        if (login && !reviewMap.has(login)) {
          reviewMap.set(login, { login, name: rr.name || login, state: 'PENDING' });
        }
      }
    }

    const reviews = Array.from(reviewMap.values()).map(r => ({
      ...r,
      avatarUrl: `https://github.com/${r.login}.png`,
    }));

    const checks = (pr.statusCheckRollup ?? []).map(c => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion || '',
      detailsUrl: c.detailsUrl,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
    }));

    const generalComments = pr.comments.map((c, i) => ({
      id: c.id ? String(c.id) : `gc_${i}`,
      body: c.body,
      author: { login: c.author.login, name: c.author.name, avatarUrl: `https://github.com/${c.author.login}.png` },
      createdAt: c.createdAt,
    }));

    const mappedInline = inlineComments.map(c => ({
      id: String(c.id),
      body: c.body,
      author: { login: c.user.login, name: c.user.name, avatarUrl: c.user.avatar_url || `https://github.com/${c.user.login}.png` },
      createdAt: c.created_at,
      path: c.path,
      line: c.line,
      diffHunk: c.diff_hunk,
    }));

    const allComments = [...generalComments, ...mappedInline]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      number: pr.number,
      url: pr.url,
      title: pr.title,
      state: pr.state,
      baseRefName: pr.baseRefName,
      headRefName: pr.headRefName,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      reviews,
      checks,
      comments: allComments,
      approvalCount: reviews.filter(r => r.state === 'APPROVED').length,
      commitCount: pr.commits?.length ?? 0,
    };
  } catch {
    return null;
  }
}

export function dismissPRNotification(worktreeId: string, notificationId: string): boolean {
  const watcher = watchers.get(worktreeId);
  if (!watcher) return false;
  watcher.dismissNotification(notificationId);
  return true;
}

export function disableAllPRWatchers(): void {
  for (const watcher of watchers.values()) {
    watcher.stop();
  }
}

// --- Auto-scan: detect open PRs for all worktrees ---

const AUTO_SCAN_INTERVAL_MS = 120_000; // 2 minutes
let autoScanTimer: NodeJS.Timeout | null = null;

interface WorktreeInfo {
  id: string;
  path: string;
  branch: string;
}

/**
 * Check a single worktree's branch for an open/merged PR.
 * If found and no watcher is running, start one.
 */
async function probeWorktreeForPR(wt: WorktreeInfo): Promise<void> {
  // Skip if watcher already exists and is not stopped
  const existing = watchers.get(wt.id);
  if (existing) {
    const status = existing.getStatus();
    if (status.phase !== 'stopped') return;
  }

  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'view', wt.branch,
      '--json', 'number,state',
    ], { cwd: wt.path });
    const pr = JSON.parse(stdout) as { number: number; state: string };

    // Open or merged PR found — start a watcher so the SSE stream picks it up
    if (pr.state === 'OPEN' || pr.state === 'MERGED' || pr.state === 'CLOSED') {
      enablePRWatcher(wt.id, wt.path, wt.branch);
    }
  } catch {
    // No PR for this branch — that's fine
  }
}

/**
 * Scan all provided worktrees for open PRs and start watchers.
 * Runs probes concurrently (max 5 at a time to avoid rate limits).
 */
export async function scanAllWorktreesForPRs(worktrees: WorktreeInfo[]): Promise<void> {
  const CONCURRENCY = 5;
  for (let i = 0; i < worktrees.length; i += CONCURRENCY) {
    const batch = worktrees.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(probeWorktreeForPR));
  }
}

/**
 * Start periodic auto-scanning for PRs.
 * Call once on startup with the list of worktrees.
 * The getWorktrees callback is called each scan to get fresh worktree data.
 */
export function startAutoScan(getWorktrees: () => Promise<WorktreeInfo[]>): void {
  stopAutoScan();

  // Initial scan
  getWorktrees().then(wts => scanAllWorktreesForPRs(wts)).catch(err => {
    console.error('Auto-scan initial PR check failed:', err);
  });

  // Periodic re-scan
  autoScanTimer = setInterval(async () => {
    try {
      const wts = await getWorktrees();
      await scanAllWorktreesForPRs(wts);
    } catch (err) {
      console.error('Auto-scan PR check failed:', err);
    }
  }, AUTO_SCAN_INTERVAL_MS);
}

export function stopAutoScan(): void {
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
    autoScanTimer = null;
  }
}
