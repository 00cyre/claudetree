import { execFile } from 'child_process';
import { promisify } from 'util';
import { createNamedSession, getAllSessionStatuses } from '../terminal/pty.js';
import { getWorktree } from '../routes/worktrees.js';

const execFileAsync = promisify(execFile);

const MAX_LOG_CHARS = 6000;
const IDLE_CHECK_INTERVAL_MS = 3000;

// Patterns that indicate runner setup noise (not actual failures)
const SETUP_NOISE_PATTERNS = [
  /^Current runner version/,
  /^Operating System$/,
  /^Runner Image$/,
  /^Runner Image Provision/,
  /^GITHUB_TOKEN Permissions/,
  /^Prepare workflow directory/,
  /^Getting action download info/,
  /^Download action repository/,
  /^Complete job/,
  /^Cleaning up orphan processes/,
  /^##\[group\]/,
  /^##\[endgroup\]/,
  /^##\[command\]/,
  /^\s*with:$/,
  /^\s*env:$/,
  /^\/usr\/bin\/git /,
  /^Syncing repository/,
  /^Deleting the contents/,
  /^Initializing the repository/,
  /^Disabling automatic garbage/,
  /^Setting up auth/,
  /^Fetching the repository/,
  /^Determining the checkout/,
  /^Checking out the ref/,
  /^node-version: /,
  /^cache: /,
  /^Set up job$/,
  /^Post job cleanup/,
];

function filterSetupNoise(logs: string): string {
  const lines = logs.split('\n');
  const filtered: string[] = [];
  let inSetupBlock = true;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines at the start
    if (inSetupBlock && !trimmed) continue;

    // Check if this line is setup noise
    const isNoise = SETUP_NOISE_PATTERNS.some(p => p.test(trimmed));
    if (isNoise) {
      inSetupBlock = true;
      continue;
    }

    // Once we see a "Run " command or actual content, we're past setup
    if (trimmed.startsWith('Run ') || trimmed.startsWith('npm ') ||
        trimmed.startsWith('Error') || trimmed.startsWith('FAIL') ||
        trimmed.includes('error TS') || trimmed.includes('FAILED')) {
      inSetupBlock = false;
    }

    if (!inSetupBlock || trimmed.length > 0) {
      inSetupBlock = false;
      filtered.push(line);
    }
  }

  return filtered.join('\n').trim();
}

export async function fetchFailedLogs(worktreePath: string, runId: number): Promise<string> {
  try {
    // First try --log-failed for the specific failure output
    const { stdout } = await execFileAsync('gh', [
      'run', 'view', String(runId), '--log-failed',
    ], { cwd: worktreePath, maxBuffer: 2 * 1024 * 1024 });

    const filtered = filterSetupNoise(stdout);

    // If filtering stripped everything, fall back to raw (truncated)
    if (!filtered.trim()) {
      return stdout.slice(-MAX_LOG_CHARS);
    }

    return filtered.slice(-MAX_LOG_CHARS);
  } catch (err) {
    // --log-failed may fail if no failed jobs. Try getting annotations instead.
    try {
      const { stdout: jobsJson } = await execFileAsync('gh', [
        'run', 'view', String(runId), '--json', 'jobs',
      ], { cwd: worktreePath });

      const { jobs } = JSON.parse(jobsJson) as {
        jobs: Array<{ name: string; conclusion: string; steps: Array<{ name: string; conclusion: string; number: number }> }>;
      };

      const failedSteps = jobs
        .filter(j => j.conclusion === 'failure')
        .flatMap(j => j.steps.filter(s => s.conclusion === 'failure').map(s => `${j.name}: step "${s.name}" failed`));

      if (failedSteps.length > 0) {
        return `Failed steps:\n${failedSteps.join('\n')}`;
      }
    } catch {
      // ignore
    }

    return `Failed to fetch logs: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export function sendFixPrompt(
  worktreeId: string,
  logs: string,
  attempt: number,
  maxAttempts: number,
): string | null {
  const wt = getWorktree(worktreeId);
  if (!wt) return null;

  const prompt = [
    `CI pipeline failed (attempt ${attempt}/${maxAttempts}).`,
    `Read the error logs below and fix the failing tests, build errors, or anything blocking the pipeline.`,
    `Focus on: build errors, unit test failures, e2e test failures, type errors, lint errors.`,
    `Do NOT change CI config or workflow files — only fix the source code.`,
    ``,
    `--- FAILED CI LOGS ---`,
    logs,
    `--- END LOGS ---`,
    ``,
    `Fix these issues now.`,
  ].join('\n');

  // Create a dedicated autofix terminal tab with the prompt in parentheses
  // Parentheses make Claude Code process it automatically as a headless command
  const sessionId = `${worktreeId}::autofix-${attempt}`;
  const wrappedPrompt = `(${prompt})`;

  createNamedSession(sessionId, wt.path, wrappedPrompt);
  return sessionId;
}

export function watchForIdle(
  sessionId: string,
  onIdle: () => void,
): () => void {
  const interval = setInterval(() => {
    const statuses = getAllSessionStatuses();
    const sessionStatus = statuses[sessionId];
    if (sessionStatus && sessionStatus.state === 'idle') {
      clearInterval(interval);
      onIdle();
    }
  }, IDLE_CHECK_INTERVAL_MS);

  return () => clearInterval(interval);
}
