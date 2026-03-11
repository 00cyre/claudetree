import { Router, Request, Response } from 'express';
import { getWorktree } from './worktrees.js';
import { writeToSession } from '../terminal/pty.js';

const router = Router();

router.post('/:worktreeId/write', (req: Request, res: Response) => {
  const wt = getWorktree(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const { text } = req.body as { text: string };
  if (typeof text !== 'string') {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const ok = writeToSession(req.params.worktreeId, text);
  if (!ok) {
    res.status(404).json({ error: 'No active terminal session for this worktree' });
    return;
  }

  res.json({ ok: true });
});

export default router;
