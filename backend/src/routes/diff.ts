import { Router, Request, Response } from 'express';
import simpleGit from 'simple-git';
import { getWorktree } from './worktrees.js';

const router = Router();

router.get('/:worktreeId', async (req: Request, res: Response) => {
  const wt = getWorktree(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  try {
    const git = simpleGit(wt.path);
    const status = await git.status();
    const files = [
      ...status.modified.map((f) => ({ file: f, status: 'modified' })),
      ...status.not_added.map((f) => ({ file: f, status: 'untracked' })),
      ...status.created.map((f) => ({ file: f, status: 'added' })),
      ...status.deleted.map((f) => ({ file: f, status: 'deleted' })),
      ...status.renamed.map((f) => ({ file: f.to ?? f.from, status: 'renamed' })),
    ];
    res.json({ branch: wt.branch, files });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:worktreeId/:file(*)', async (req: Request, res: Response) => {
  const wt = getWorktree(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  try {
    const git = simpleGit(wt.path);
    const diff = await git.diff(['HEAD', '--', req.params.file]);
    res.json({ file: req.params.file, diff });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
