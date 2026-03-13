import { Router, Request, Response } from 'express';
import { getWorktree } from './worktrees.js';
import {
  enablePipeline,
  disablePipeline,
  getPipelineStatus,
} from '../pipeline/watcher.js';

const router = Router();

router.post('/:worktreeId/enable', async (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  const wt = getWorktree(worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const status = enablePipeline(worktreeId, wt.path, wt.branch);
  res.json({ status });
});

router.post('/:worktreeId/disable', (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  disablePipeline(worktreeId);
  res.json({ ok: true });
});

router.get('/:worktreeId', (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  const status = getPipelineStatus(worktreeId);
  res.json(status);
});

export default router;
