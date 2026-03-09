import { useState, useEffect, useCallback, useRef } from 'react';
import type { Worktree, ChangedFile, FileAnalysis } from '../types/index.js';
import { api } from '../api/client.js';
import { extractTicketIdFromBranch } from '../utils/linear.js';
import { getFileIcon } from '../utils/fileIcons.js';
import { DiffViewer } from './DiffViewer.js';
import { CommitPanel } from './CommitPanel.js';

interface ReviewTabProps {
  selectedWorktree: Worktree | null;
  aiConnected: boolean;
}

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
    return <div className="review-placeholder">Select a worktree to review changes</div>;
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
    <div className="review-tab">
      <div className="review-files">
        <div className="review-files-header">
          <h4>Changed Files</h4>
          <span className="review-total-stats">
            {totalAdditions > 0 && <span className="file-stat-add">+{totalAdditions}</span>}
            {totalDeletions > 0 && <span className="file-stat-del">-{totalDeletions}</span>}
          </span>
        </div>

        {analysis?.summary && (
          <div className="review-summary">{analysis.summary}</div>
        )}
        {analyzing && (
          <div className="review-analyzing">Analyzing changes...</div>
        )}

        {loading ? (
          <div>Loading...</div>
        ) : files.length === 0 ? (
          <div className="review-empty">No changes</div>
        ) : (
          <ul className="file-list">
            {sortedFiles.map((f) => (
              <li
                key={f.file}
                className={`file-item ${selectedFile === f.file ? 'active' : ''}`}
                onClick={() => setSelectedFile(f.file)}
              >
                <div className="file-item-top">
                  <span className={`file-status status-${f.status}`}>{f.status[0].toUpperCase()}</span>
                  {getFileIcon(f.file)}
                  <span className="file-name">{f.file}</span>
                  <span className="file-stats">
                    {f.additions > 0 && <span className="file-stat-add">+{f.additions}</span>}
                    {f.deletions > 0 && <span className="file-stat-del">-{f.deletions}</span>}
                  </span>
                </div>
                {analysis?.explanations[f.file] && (
                  <div className="file-explanation">{analysis.explanations[f.file]}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="review-main">
        {selectedFile ? (
          <DiffViewer
            worktreeId={selectedWorktree.id}
            file={selectedFile}
            explanation={analysis?.explanations[selectedFile]}
          />
        ) : (
          <div className="review-placeholder">Select a file to view diff</div>
        )}
      </div>

      <div className="review-commit">
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
