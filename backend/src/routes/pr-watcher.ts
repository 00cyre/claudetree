import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getWorktree } from './worktrees.js';
import {
  getPRWatcherStatus,
  dismissPRNotification,
  getPRDetailedData,
  fetchPRDetailsOnDemand,
  enablePRWatcher,
} from '../pipeline/pr-watcher.js';

const execFileAsync = promisify(execFile);

const router = Router();

router.get('/:worktreeId', (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  const wt = getWorktree(worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }
  const status = getPRWatcherStatus(worktreeId);
  res.json(status);
});

router.get('/:worktreeId/details', async (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  const wt = getWorktree(worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }
  // Try watcher cache first, then fetch on-demand
  let data = await getPRDetailedData(worktreeId);
  if (!data) {
    data = await fetchPRDetailsOnDemand(wt.path, wt.branch);
    // Start a watcher so SSE picks up status (reviews, CI, etc.)
    if (data) {
      enablePRWatcher(worktreeId, wt.path, wt.branch);
    }
  }
  if (!data) {
    res.status(404).json({ error: 'No PR found for this branch' });
    return;
  }
  res.json(data);
});

router.post('/:worktreeId/dismiss/:notificationId', (req: Request, res: Response) => {
  const { worktreeId, notificationId } = req.params;
  const ok = dismissPRNotification(worktreeId, notificationId);
  if (!ok) {
    res.status(404).json({ error: 'Watcher or notification not found' });
    return;
  }
  res.json({ ok: true });
});

router.post('/:worktreeId/comment', async (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  const wt = getWorktree(worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const { body, replyToCommentId } = req.body as { body?: string; replyToCommentId?: string };
  if (!body || !body.trim()) {
    res.status(400).json({ error: 'Comment body is required' });
    return;
  }

  try {
    // Get PR info to determine repo and PR number
    const status = getPRWatcherStatus(worktreeId);
    const prNumber = status?.prNumber;

    if (replyToCommentId && !replyToCommentId.startsWith('gc_') && prNumber) {
      // Reply to an inline review comment via REST API
      const { stdout: repoStdout } = await execFileAsync('gh', [
        'repo', 'view', '--json', 'owner,name',
      ], { cwd: wt.path });
      const repo = JSON.parse(repoStdout) as { owner: { login: string }; name: string };

      await execFileAsync('gh', [
        'api',
        `repos/${repo.owner.login}/${repo.name}/pulls/${prNumber}/comments/${replyToCommentId}/replies`,
        '-f', `body=${body}`,
      ], { cwd: wt.path });
    } else if (prNumber) {
      // General PR comment
      await execFileAsync('gh', [
        'pr', 'comment', String(prNumber),
        '--body', body,
      ], { cwd: wt.path });
    } else {
      // Try using branch name
      await execFileAsync('gh', [
        'pr', 'comment', wt.branch,
        '--body', body,
      ], { cwd: wt.path });
    }

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to post PR comment for ${worktreeId}:`, err);
    res.status(500).json({ error: msg });
  }
});

export default router;
