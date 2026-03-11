import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import simpleGit from 'simple-git';
import { getWorktree } from './worktrees.js';
import { loadConfig } from '../config.js';
import { analyzeChanges, analyzeFileDetailed, analyzeNarrative } from '../ai/analyzer.js';
import type { AnalysisResult, FileDetailedAnalysis, NarrativeAnalysis } from '../ai/analyzer.js';
import { loadAggregateAnalysis, saveAggregateAnalysis, loadFileAnalysis, saveFileAnalysis, loadNarrativeByFingerprint, saveNarrativeWithFingerprint } from '../analysis-cache.js';

interface CacheEntry<T> {
  result: T;
  timestamp: number;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const changesCache = new Map<string, CacheEntry<AnalysisResult>>();
const fileCache = new Map<string, CacheEntry<FileDetailedAnalysis>>();
const narrativeCache = new Map<string, CacheEntry<NarrativeAnalysis>>();

function hashContent(parts: string[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

const router = Router();

router.get('/:worktreeId', async (req: Request, res: Response) => {
  const wt = getWorktree(req.params.worktreeId);
  if (!wt) {
    res.status(404).json({ error: 'Worktree not found' });
    return;
  }

  const scope = (req.query.scope as string) || 'uncommitted';
  const baseBranch = (req.query.base as string) || 'main';

  try {
    const git = simpleGit(wt.path);

    if (scope === 'branch') {
      // Branch diff: all changes compared to base branch (committed + uncommitted)
      const diffRef = `origin/${baseBranch}...HEAD`;
      const statsMap = new Map<string, { additions: number; deletions: number }>();
      const fileStatuses = new Map<string, string>();

      // Get numstat for additions/deletions
      try {
        const numstat = await git.diff([diffRef, '--numstat']);
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

      // Also include uncommitted changes
      try {
        const uncommittedNumstat = await git.diff(['HEAD', '--numstat']);
        for (const line of uncommittedNumstat.split('\n')) {
          const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
          if (match) {
            const existing = statsMap.get(match[3]);
            const add = match[1] === '-' ? 0 : parseInt(match[1], 10);
            const del = match[2] === '-' ? 0 : parseInt(match[2], 10);
            statsMap.set(match[3], {
              additions: (existing?.additions ?? 0) + add,
              deletions: (existing?.deletions ?? 0) + del,
            });
          }
        }
      } catch { /* optional */ }

      // Get file status (added/modified/deleted)
      try {
        const nameStatus = await git.diff([diffRef, '--name-status']);
        for (const line of nameStatus.split('\n')) {
          const match = line.match(/^([ADMR])\t(.+)$/);
          if (match) {
            const statusMap: Record<string, string> = { A: 'added', D: 'deleted', M: 'modified', R: 'renamed' };
            fileStatuses.set(match[2], statusMap[match[1]] ?? 'modified');
          }
        }
      } catch { /* optional */ }

      // Also add uncommitted untracked files
      const status = await git.status();
      for (const f of status.not_added) {
        if (!fileStatuses.has(f)) fileStatuses.set(f, 'untracked');
        if (!statsMap.has(f)) statsMap.set(f, { additions: 0, deletions: 0 });
      }
      for (const f of status.modified) {
        if (!fileStatuses.has(f)) fileStatuses.set(f, 'modified');
      }
      for (const f of status.created) {
        if (!fileStatuses.has(f)) fileStatuses.set(f, 'added');
      }

      const files = [...fileStatuses.entries()].map(([file, st]) => ({
        file,
        status: st,
        additions: statsMap.get(file)?.additions ?? 0,
        deletions: statsMap.get(file)?.deletions ?? 0,
      }));

      // Get per-file diffs for narrative
      const fileDiffs: Record<string, string> = {};
      for (const f of files) {
        try {
          // Get combined diff: branch changes + uncommitted
          const branchDiff = await git.diff([`origin/${baseBranch}...HEAD`, '--', f.file]);
          const uncommittedDiff = await git.diff(['HEAD', '--', f.file]);
          fileDiffs[f.file] = branchDiff || uncommittedDiff || '';
        } catch {
          fileDiffs[f.file] = '';
        }
      }

      res.json({ baseBranch, branch: wt.branch, files, fileDiffs });
      return;
    }

    // Default: uncommitted scope (existing behavior)
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

    const ticketContext = req.body?.ticketContext as { id: string; title: string; description?: string } | undefined;
    const withDiffs = fileDiffs.filter((f) => f.diff);
    const cacheKey = hashContent([
      ...withDiffs.flatMap((f) => [f.file, f.diff]),
      ticketContext?.id ?? '',
    ]);
    const cached = getCached(changesCache, cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const diskCached = loadAggregateAnalysis(req.params.worktreeId, cacheKey);
    if (diskCached) {
      changesCache.set(cacheKey, { result: diskCached, timestamp: Date.now() });
      res.json(diskCached);
      return;
    }

    const result = await analyzeChanges(config.anthropicApiKey, withDiffs, ticketContext);
    changesCache.set(cacheKey, { result, timestamp: Date.now() });
    saveAggregateAnalysis(req.params.worktreeId, cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:worktreeId/narrative', async (req: Request, res: Response) => {
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

  const baseBranch = req.body?.baseBranch as string || 'main';
  const ticketContext = req.body?.ticketContext as { id: string; title: string; description?: string } | undefined;
  const clientFingerprint = req.body?.fingerprint as string | undefined;

  try {
    const git = simpleGit(wt.path);

    // Step 1: Compute a cheap state fingerprint (HEAD commit + dirty file list)
    // This avoids reading all diffs when nothing has changed.
    let headHash = '';
    try { headHash = (await git.revparse(['HEAD'])).trim(); } catch { /* empty repo */ }
    const porcelain = await git.status();
    const dirtyList = [
      ...porcelain.modified,
      ...porcelain.not_added,
      ...porcelain.created,
      ...porcelain.deleted,
      ...porcelain.renamed.map((f) => f.to ?? f.from),
    ].sort().join('\n');
    const fingerprint = hashContent(['narrative-fp', baseBranch, headHash, dirtyList, ticketContext?.id ?? '']);

    // Step 2: Fast path — if fingerprint matches, return disk-cached result immediately
    if (clientFingerprint === fingerprint) {
      // Client already has this version
      res.json({ fingerprint, cached: true });
      return;
    }

    const memoryCached = getCached(narrativeCache, fingerprint);
    if (memoryCached) {
      res.json({ ...memoryCached, fingerprint });
      return;
    }

    const diskCached = loadNarrativeByFingerprint(req.params.worktreeId, fingerprint);
    if (diskCached) {
      narrativeCache.set(fingerprint, { result: diskCached, timestamp: Date.now() });
      res.json({ ...diskCached, fingerprint });
      return;
    }

    // Step 3: Slow path — read all diffs and run AI analysis
    const diffRef = `origin/${baseBranch}...HEAD`;

    const branchFiles = new Set<string>();
    try {
      const nameOnly = await git.diff([diffRef, '--name-only']);
      for (const line of nameOnly.split('\n')) {
        if (line.trim()) branchFiles.add(line.trim());
      }
    } catch { /* may fail if remote not available */ }

    for (const f of [...porcelain.modified, ...porcelain.not_added, ...porcelain.created]) {
      branchFiles.add(f);
    }
    for (const f of porcelain.renamed) {
      branchFiles.add(f.to ?? f.from);
    }

    const fileDiffs = await Promise.all(
      [...branchFiles].map(async (file) => {
        try {
          const branchDiff = await git.diff([diffRef, '--', file]);
          if (branchDiff) return { file, diff: branchDiff };
          const uncommittedDiff = await git.diff(['HEAD', '--', file]);
          return { file, diff: uncommittedDiff };
        } catch {
          return { file, diff: '' };
        }
      }),
    );

    const withDiffs = fileDiffs.filter((f) => f.diff);
    const contentHash = hashContent([
      'narrative',
      baseBranch,
      ...withDiffs.flatMap((f) => [f.file, f.diff]),
      ticketContext?.id ?? '',
    ]);

    const result = await analyzeNarrative(config.anthropicApiKey, withDiffs, ticketContext);
    narrativeCache.set(fingerprint, { result, timestamp: Date.now() });
    saveNarrativeWithFingerprint(req.params.worktreeId, fingerprint, contentHash, result);
    res.json({ ...result, fingerprint });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/:worktreeId/:file/analyze', async (req: Request, res: Response) => {
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

  const file = decodeURIComponent(req.params.file);
  try {
    const ticketContext = req.body?.ticketContext as { id: string; title: string; description?: string } | undefined;
    const git = simpleGit(wt.path);
    const diff = await git.diff(['HEAD', '--', file]);

    const cacheKey = hashContent([file, diff, ticketContext?.id ?? '']);
    const cached = getCached(fileCache, cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const diskCached = loadFileAnalysis(req.params.worktreeId, file, cacheKey);
    if (diskCached) {
      fileCache.set(cacheKey, { result: diskCached, timestamp: Date.now() });
      res.json(diskCached);
      return;
    }

    const result = await analyzeFileDetailed(config.anthropicApiKey, file, diff, ticketContext);
    fileCache.set(cacheKey, { result, timestamp: Date.now() });
    saveFileAnalysis(req.params.worktreeId, file, cacheKey, result);
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
