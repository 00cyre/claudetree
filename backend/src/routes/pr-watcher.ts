import { Router, Request, Response } from 'express';
import { getWorktree } from './worktrees.js';
import {
  getPRWatcherStatus,
  dismissPRNotification,
  getPRDetailedData,
  fetchPRDetailsOnDemand,
} from '../pipeline/pr-watcher.js';

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

export default router;
