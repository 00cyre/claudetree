import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';
import simpleGit from 'simple-git';
import { loadConfig, saveConfig, getWorktreeLink, setWorktreeLink, removeWorktreeLink } from '../config.js';
import { linearClient } from '../linear/client.js';

const router = Router();

interface Worktree {
  id: string;
  name: string;
  path: string;
  branch: string;
  projectId: string;
  linearIssueId?: string;
  description?: string;
}

function stableId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

const worktreeRegistry: Map<string, Worktree> = new Map();

export function getWorktree(id: string): Worktree | undefined {
  return worktreeRegistry.get(id);
}

/**
 * Discover all worktrees across all projects and populate the registry.
 * Returns worktrees for pre-initializing terminal sessions.
 */
export async function discoverAllWorktrees(): Promise<Worktree[]> {
  const config = loadConfig();
  const allWorktrees: Worktree[] = [];

  for (const project of config.projects) {
    if (!existsSync(project.path)) continue;
    try {
      const git = simpleGit(project.path);
      const result = await git.raw(['worktree', 'list', '--porcelain']);
      const blocks = result.split('\n\n').filter(Boolean);

      for (const block of blocks) {
        const lines = block.split('\n');
        const wtPath = lines.find((l) => l.startsWith('worktree '))?.replace('worktree ', '');
        const branch = lines.find((l) => l.startsWith('branch '))?.replace('branch refs/heads/', '');
        if (wtPath && branch && wtPath !== project.path) {
          const id = stableId(wtPath);
          const link = getWorktreeLink(wtPath);
          const description = link?.description ?? link?.linearIssueTitle;
          const wt: Worktree = { id, name: branch, path: wtPath, branch, projectId: project.id, linearIssueId: link?.linearIssueId, description };
          worktreeRegistry.set(id, wt);
          allWorktrees.push(wt);
        }
      }
    } catch (err) {
      console.error(`Failed to discover worktrees for project ${project.name}:`, err);
    }
  }

  return allWorktrees;
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
        const id = stableId(wtPath);
        const link = getWorktreeLink(wtPath);
        const description = link?.description ?? link?.linearIssueTitle;
        const wt: Worktree = { id, name: branch, path: wtPath, branch, projectId, linearIssueId: link?.linearIssueId, description };
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

    const id = stableId(wtPath);
    const wt: Worktree = { id, name, path: wtPath, branch: name, projectId };
    worktreeRegistry.set(id, wt);

    // Pre-initialize Claude Code for the new worktree (dynamic import to avoid circular dep)
    const { preInitializeSessions } = await import('../terminal/pty.js');
    preInitializeSessions([{ id, path: wtPath }]);

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
    const { killSession } = await import('../terminal/pty.js');
    killSession(id);
    const git = simpleGit(project.path);
    await git.raw(['worktree', 'remove', wt.path, '--force']);
    worktreeRegistry.delete(id);
    removeWorktreeLink(wt.path);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:projectId/:worktreeId/link', async (req: Request, res: Response) => {
  const { worktreeId } = req.params;
  const { linearIssueId } = req.body as { linearIssueId?: string };

  if (!linearIssueId?.trim()) {
    res.status(400).json({ error: 'linearIssueId is required' });
    return;
  }

  const wt = worktreeRegistry.get(worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const trimmedId = linearIssueId.trim();
  const linkData: { linearIssueId: string; linearIssueTitle?: string } = { linearIssueId: trimmedId };

  // Try to cache the Linear issue title
  try {
    const issue = await linearClient.getIssue(trimmedId);
    if (issue?.title) {
      linkData.linearIssueTitle = issue.title;
      wt.description = issue.title;
    }
  } catch {
    // Linear may not be connected; link without title
  }

  setWorktreeLink(wt.path, linkData);
  wt.linearIssueId = trimmedId;
  res.json({ ok: true });
});

router.delete('/:projectId/:worktreeId/link', async (req: Request, res: Response) => {
  const { worktreeId } = req.params;

  const wt = worktreeRegistry.get(worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  removeWorktreeLink(wt.path);
  delete wt.linearIssueId;
  res.json({ ok: true });
});

export default router;
