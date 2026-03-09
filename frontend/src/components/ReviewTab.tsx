import { useState, useEffect, useCallback, useRef } from 'react';
import type { Worktree, ChangedFile, FileAnalysis } from '@/types';
import { api } from '@/api/client';
import { extractTicketIdFromBranch } from '@/utils/linear';
import { getFileIcon } from '@/utils/fileIcons';
import { DiffViewer } from '@/components/DiffViewer';
import { CommitPanel } from '@/components/CommitPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ReviewTabProps {
  selectedWorktree: Worktree | null;
  aiConnected: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  modified: 'text-yellow-600 dark:text-yellow-400',
  added: 'text-green-600 dark:text-green-400',
  untracked: 'text-green-600 dark:text-green-400',
  deleted: 'text-red-600 dark:text-red-400',
  renamed: 'text-primary',
};

export function ReviewTab({ selectedWorktree, aiConnected }: ReviewTabProps) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const lastAnalyzedId = useRef<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!selectedWorktree) return;
    setLoading(true);
    try {
      const data = await api.getDiff(selectedWorktree.id);
      setFiles(data.files);
      setSelectedFile(null);
    } catch (err) {
      console.error('Failed to load diff:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedWorktree]);

  useEffect(() => {
    loadFiles();
    setAnalysis(null);
    lastAnalyzedId.current = null;
  }, [loadFiles]);

  useEffect(() => {
    if (!selectedWorktree || !aiConnected || files.length === 0) return;
    if (lastAnalyzedId.current === selectedWorktree.id) return;

    let cancelled = false;
    setAnalyzing(true);
    lastAnalyzedId.current = selectedWorktree.id;

    api.analyzeChanges(selectedWorktree.id)
      .then((result) => {
        if (!cancelled) setAnalysis(result);
      })
      .catch((err) => {
        console.error('Analysis failed:', err);
        if (!cancelled) lastAnalyzedId.current = null;
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });

    return () => { cancelled = true; };
  }, [selectedWorktree, aiConnected, files]);

  if (!selectedWorktree) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a worktree to review changes
      </div>
    );
  }

  const sortedFiles = analysis
    ? [...files].sort((a, b) => {
        const ai = analysis.sortOrder.indexOf(a.file);
        const bi = analysis.sortOrder.indexOf(b.file);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : files;

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="flex h-full">
      <div className="w-64 min-w-64 flex flex-col border-r border-border overflow-hidden">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-border shrink-0">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Changed Files</h4>
          <span className="flex gap-2 text-xs">
            {totalAdditions > 0 && <span className="text-green-600 dark:text-green-400">+{totalAdditions}</span>}
            {totalDeletions > 0 && <span className="text-red-600 dark:text-red-400">-{totalDeletions}</span>}
          </span>
        </div>

        {analysis?.summary && (
          <div className="p-3 text-xs text-muted-foreground border-b border-border">{analysis.summary}</div>
        )}
        {analyzing && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Analyzing changes...</div>
        )}

        {loading ? (
          <div className="p-3 text-sm text-muted-foreground">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">No changes</div>
        ) : (
          <ScrollArea className="flex-1">
            <ul className="p-2 space-y-0.5">
              {sortedFiles.map((f) => (
                <li
                  key={f.file}
                  className={cn(
                    'flex flex-col gap-0.5 px-2 py-1.5 rounded-md cursor-pointer text-sm',
                    selectedFile === f.file ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => setSelectedFile(f.file)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('font-bold w-4 shrink-0', STATUS_COLORS[f.status] ?? '')}>
                      {f.status[0].toUpperCase()}
                    </span>
                    {getFileIcon(f.file)}
                    <span className="truncate flex-1">{f.file}</span>
                    <span className="flex gap-1 shrink-0 text-xs">
                      {f.additions > 0 && <span className="text-green-600 dark:text-green-400">+{f.additions}</span>}
                      {f.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{f.deletions}</span>}
                    </span>
                  </div>
                  {analysis?.explanations[f.file] && (
                    <div className="text-xs text-muted-foreground pl-6 truncate" title={analysis.explanations[f.file]}>
                      {analysis.explanations[f.file]}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      <div className="flex-1 overflow-auto min-w-0">
        {selectedFile ? (
          <DiffViewer
            worktreeId={selectedWorktree.id}
            file={selectedFile}
            explanation={analysis?.explanations[selectedFile]}
            aiConnected={aiConnected}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a file to view diff
          </div>
        )}
      </div>

      <div className="w-72 min-w-72 flex flex-col border-l border-border overflow-hidden">
        <CommitPanel
          worktreeId={selectedWorktree.id}
          files={files}
          onCommit={loadFiles}
          linearIssueId={selectedWorktree.linearIssueId ?? extractTicketIdFromBranch(selectedWorktree.name) ?? undefined}
        />
      </div>
    </div>
  );
}
