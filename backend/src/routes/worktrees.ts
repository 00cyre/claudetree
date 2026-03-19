import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';
import simpleGit from 'simple-git';
import { loadConfig, saveConfig, getWorktreeLink, setWorktreeLink, removeWorktreeLink, getFlags, addFlag, removeFlag, getWorktreeOrder, setWorktreeOrder, getFolders, addFolder, updateFolder, removeFolder, getFolderOrder, setFolderOrder } from '../config.js';
import type { Flag, Folder } from '../config.js';
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
  flags?: string[];
  folderId?: string;
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
          const wt: Worktree = { id, name: branch, path: wtPath, branch, projectId: project.id, linearIssueId: link?.linearIssueId, description, flags: link?.flags, folderId: link?.folderId };
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

// --- Flag definitions (must be before /:projectId routes) ---

router.get('/meta/flags', (_req: Request, res: Response) => {
  res.json(getFlags());
});

router.post('/meta/flags', (req: Request, res: Response) => {
  const { name, color } = req.body as Flag;
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  addFlag({ name: name.trim(), color: color || '#6b7280' });
  res.json({ ok: true });
});

router.delete('/meta/flags/:name', async (req: Request, res: Response) => {
  const flagName = req.params.name;
  removeFlag(flagName);

  // If deleting PROpen flag, stop all active PR watchers
  if (flagName === 'PR OPEN') {
    const { disableAllPRWatchers } = await import('../pipeline/pr-watcher.js');
    disableAllPRWatchers();
  }

  res.json({ ok: true });
});

// --- Folder CRUD (must be before /:projectId to avoid param collision) ---

router.get('/:projectId/folders', (req: Request, res: Response) => {
  const projectId = req.params.projectId;
  const folders = getFolders(projectId);
  const order = getFolderOrder(projectId);
  if (order.length > 0) {
    folders.sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }
  res.json(folders);
});

router.post('/:projectId/folders', (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const id = randomUUID().slice(0, 8);
  const folder: Folder = { id, name: name.trim() };
  addFolder(req.params.projectId, folder);
  // Append to folderOrder
  const order = getFolderOrder(req.params.projectId);
  setFolderOrder(req.params.projectId, [...order, id]);
  res.status(201).json(folder);
});

router.put('/:projectId/folders/order', (req: Request, res: Response) => {
  const { order } = req.body as { order: string[] };
  if (!Array.isArray(order)) {
    res.status(400).json({ error: 'order must be an array of folder IDs' });
    return;
  }
  setFolderOrder(req.params.projectId, order);
  res.json({ ok: true });
});

router.put('/:projectId/folders/:folderId', (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  updateFolder(req.params.projectId, req.params.folderId, name.trim());
  res.json({ ok: true });
});

router.delete('/:projectId/folders/:folderId', (req: Request, res: Response) => {
  removeFolder(req.params.projectId, req.params.folderId);
  res.json({ ok: true });
});

// --- Worktree folder assignment ---

router.put('/:worktreeId/folder', (req: Request, res: Response) => {
  const wt = worktreeRegistry.get(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }
  const { folderId } = req.body as { folderId: string | null };
  const existing = getWorktreeLink(wt.path) ?? {};
  if (folderId) {
    setWorktreeLink(wt.path, { ...existing, folderId });
    wt.folderId = folderId;
  } else {
    delete existing.folderId;
    setWorktreeLink(wt.path, existing);
    delete wt.folderId;
  }
  res.json({ ok: true });
});

router.get('/:projectId/branches', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const config = loadConfig();
  const project = config.projects.find((p) => p.id === projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const git = simpleGit(project.path);
    await git.fetch(['origin', '--prune']);
    const result = await git.raw(['branch', '-r', '--format=%(refname:short)']);
    const branches = result
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean)
      .filter((b) => !b.includes('HEAD'))
      .map((b) => b.replace(/^origin\//, ''));
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

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
        const wt: Worktree = { id, name: branch, path: wtPath, branch, projectId, linearIssueId: link?.linearIssueId, description, flags: link?.flags, folderId: link?.folderId };
        worktreeRegistry.set(id, wt);
        worktrees.push(wt);
      }
    }
    // Sort by persisted order
    const order = getWorktreeOrder(projectId);
    if (order.length > 0) {
      worktrees.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }

    res.json(worktrees);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:projectId', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { name, baseBranch } = req.body as { name: string; baseBranch?: string };
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

    // Always fetch latest from origin before creating worktree
    await git.fetch('origin');

    // Branch off the remote base branch (defaults to main)
    const base = baseBranch?.trim() || 'main';
    try {
      await git.raw(['worktree', 'add', wtPath, '-b', name, `origin/${base}`]);
    } catch (err) {
      // If branch already exists, create worktree with the existing branch
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        await git.raw(['worktree', 'add', wtPath, name]);
      } else {
        throw err;
      }
    }

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

// --- Worktree order ---

router.get('/:projectId/order', (req: Request, res: Response) => {
  res.json(getWorktreeOrder(req.params.projectId));
});

router.put('/:projectId/order', (req: Request, res: Response) => {
  const { order } = req.body as { order: string[] };
  if (!Array.isArray(order)) {
    res.status(400).json({ error: 'order must be an array of worktree IDs' });
    return;
  }
  setWorktreeOrder(req.params.projectId, order);
  res.json({ ok: true });
});

// --- Worktree flags ---

router.put('/:worktreeId/flags', async (req: Request, res: Response) => {
  const wt = worktreeRegistry.get(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }
  const { flags } = req.body as { flags: string[] };
  if (!Array.isArray(flags)) {
    res.status(400).json({ error: 'flags must be an array of flag names' });
    return;
  }
  const existing = getWorktreeLink(wt.path) ?? {};
  const prevFlags = existing.flags ?? [];
  setWorktreeLink(wt.path, { ...existing, flags });

  // PROpen flag toggle → start/stop PR watcher
  const hadPROpen = prevFlags.includes('PR OPEN');
  const hasPROpen = flags.includes('PR OPEN');
  if (!hadPROpen && hasPROpen) {
    const { enablePRWatcher } = await import('../pipeline/pr-watcher.js');
    enablePRWatcher(wt.id, wt.path, wt.branch);
  } else if (hadPROpen && !hasPROpen) {
    const { disablePRWatcher } = await import('../pipeline/pr-watcher.js');
    disablePRWatcher(wt.id);
  }

  res.json({ ok: true });
});

export default router;
