import { createHash } from 'crypto';
import simpleGit from 'simple-git';
import { loadConfig, getWorktreeLink } from './config.js';
import { analyzeChanges, analyzeFileDetailed } from './ai/analyzer.js';
import {
  saveAggregateAnalysis,
  saveFileAnalysis,
} from './analysis-cache.js';

function hashContent(parts: string[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

export function triggerExitAnalysis(worktreeId: string, worktreePath: string): void {
  (async () => {
    try {
      const config = loadConfig();
      if (!config.anthropicApiKey) return;

      const link = getWorktreeLink(worktreePath);
      const ticketContext = link?.linearIssueId && link?.linearIssueTitle
        ? { id: link.linearIssueId, title: link.linearIssueTitle }
        : undefined;

      const git = simpleGit(worktreePath);
      const status = await git.status();
      const changedFiles = [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.renamed.map((f) => f.to ?? f.from),
      ];

      if (changedFiles.length === 0) return;

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

      const withDiffs = fileDiffs.filter((f) => f.diff);
      if (withDiffs.length === 0) return;

      // Aggregate analysis
      const aggCacheKey = hashContent([
        ...withDiffs.flatMap((f) => [f.file, f.diff]),
        ticketContext?.id ?? '',
      ]);
      const aggResult = await analyzeChanges(config.anthropicApiKey, withDiffs, ticketContext);
      saveAggregateAnalysis(worktreeId, aggCacheKey, aggResult);

      // Per-file analysis in batches of 3
      const BATCH_SIZE = 3;
      for (let i = 0; i < withDiffs.length; i += BATCH_SIZE) {
        const batch = withDiffs.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async ({ file, diff }) => {
            const fileCacheKey = hashContent([file, diff, ticketContext?.id ?? '']);
            const result = await analyzeFileDetailed(config.anthropicApiKey!, file, diff, ticketContext);
            saveFileAnalysis(worktreeId, file, fileCacheKey, result);
          }),
        );
      }

      console.log(`Exit analysis complete for worktree ${worktreeId} (${withDiffs.length} files)`);
    } catch (err) {
      console.error(`Exit analysis failed for worktree ${worktreeId}:`, err);
    }
  })();
}
