import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';
import simpleGit from 'simple-git';
import { loadConfig, saveConfig } from '../config.js';

const router = Router();

interface Worktree {
  id: string;
  name: string;
  path: string;
  branch: string;
  projectId: string;
}

// In-memory worktree registry (persists while server runs)
const worktreeRegistry: Map<string, Worktree> = new Map();

export function getWorktree(id: string): Worktree | undefined {
  return worktreeRegistry.get(id);
}

router.get('/:projectId', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const git = simpleGit(project.path);
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    const worktrees: Worktree[] = [];

    const blocks = result.split('\n\n').filter(Boolean);
    for (const block of blocks) {
      const lines = block.split('\n');
      const wtPath = lines.find((l) => l.startsWith('worktree '))?.replace('worktree ', '');
      const branch = lines.find((l) => l.startsWith('branch '))?.replace('branch refs/heads/', '');
      if (wtPath && branch && wtPath !== project.path) {
        const existing = Array.from(worktreeRegistry.values()).find((w) => w.path === wtPath);
        const id = existing?.id || randomUUID();
        const wt: Worktree = { id, name: branch, path: wtPath, branch, projectId };
        worktreeRegistry.set(id, wt);
        worktrees.push(wt);
      }
    }
    res.json(worktrees);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:projectId', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { name } = req.body as { name: string };
  if (!name) {
    res.status(400).json({ error: 'Feature name is required' });
    return;
  }

  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const worktreeBase = project.worktreeBase;
  if (!existsSync(worktreeBase)) {
    mkdirSync(worktreeBase, { recursive: true });
  }

  const wtPath = join(worktreeBase, name);
  try {
    const git = simpleGit(project.path);
    await git.raw(['worktree', 'add', wtPath, '-b', name]);

    // Copy Claude Code config files
    const filesToCopy = ['.claude', 'CLAUDE.md', '.cursorrules'];
    for (const file of filesToCopy) {
      const src = join(project.path, file);
      if (existsSync(src)) {
        cpSync(src, join(wtPath, file), { recursive: true });
      }
    }

    const id = randomUUID();
    const wt: Worktree = { id, name, path: wtPath, branch: name, projectId };
    worktreeRegistry.set(id, wt);
    res.status(201).json(wt);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const wt = worktreeRegistry.get(id);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const config = loadConfig();
  const project = config.projects.find((p) => p.id === wt.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const git = simpleGit(project.path);
    await git.raw(['worktree', 'remove', wt.path, '--force']);
    worktreeRegistry.delete(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
