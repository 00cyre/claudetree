import { Router, Request, Response } from 'express';
import simpleGit from 'simple-git';
import { getWorktree } from './worktrees.js';
import { loadConfig } from '../config.js';
import { analyzeChanges } from '../ai/analyzer.js';

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

router.post('/:worktreeId/analyze', async (req: Request, res: Response) => {
  const wt = getWorktree(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const config = loadConfig();
  if (!config.anthropicApiKey) {
    res.status(503).json({ error: 'AI not configured' });
    return;
  }

  try {
    const git = simpleGit(wt.path);
    const status = await git.status();
    const changedFiles = [
      ...status.modified,
      ...status.not_added,
      ...status.created,
      ...status.renamed.map((f) => f.to ?? f.from),
    ];

    const fileDiffs = await Promise.all(
      changedFiles.map(async (file) => {
        try {
          const diff = await git.diff(['HEAD', '--', file]);
          return { file, diff };
        } catch {
          return { file, diff: '' };
        }
      }),
    );

    const result = await analyzeChanges(config.anthropicApiKey, fileDiffs.filter((f) => f.diff));
    res.json(result);
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
