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

    // Get line stats (additions/deletions) per file
    const statsMap = new Map<string, { additions: number; deletions: number }>();
    try {
      const numstat = await git.diff(['HEAD', '--numstat']);
      for (const line of numstat.split('\n')) {
        const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (match) {
          statsMap.set(match[3], {
            additions: match[1] === '-' ? 0 : parseInt(match[1], 10),
            deletions: match[2] === '-' ? 0 : parseInt(match[2], 10),
          });
        }
      }
    } catch { /* stats are optional */ }

    const filesWithStats = files.map((f) => ({
      ...f,
      additions: statsMap.get(f.file)?.additions ?? 0,
      deletions: statsMap.get(f.file)?.deletions ?? 0,
    }));

    res.json({ branch: wt.branch, files: filesWithStats });
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
