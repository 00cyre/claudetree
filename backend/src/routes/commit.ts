import { Router, Request, Response } from 'express';
import simpleGit from 'simple-git';
import { getWorktree } from './worktrees.js';

const router = Router();

router.post('/:worktreeId', async (req: Request, res: Response) => {
  const wt = getWorktree(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const { message, files } = req.body as { message: string; files?: string[] };
  if (!message) {
    res.status(400).json({ error: 'Commit message is required' });
    return;
  }

  try {
    const git = simpleGit(wt.path);
    if (files && files.length > 0) {
      await git.add(files);
    } else {
      await git.add('.');
    }
    const result = await git.commit(message);
    res.json({ ok: true, summary: result.summary });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
