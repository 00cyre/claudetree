import { useState, useEffect, useCallback } from 'react';
import type { Worktree, ChangedFile } from '../types/index.js';
import { api } from '../api/client.js';
import { DiffViewer } from './DiffViewer.js';
import { CommitPanel } from './CommitPanel.js';

interface ReviewTabProps {
  selectedWorktree: Worktree | null;
}

export function ReviewTab({ selectedWorktree }: ReviewTabProps) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
  }, [loadFiles]);

  if (!selectedWorktree) {
    return <div className="review-placeholder">Select a worktree to review changes</div>;
  }

  return (
    <div className="review-tab">
      <div className="review-files">
        <h4>Changed Files</h4>
        {loading ? (
          <div>Loading...</div>
        ) : files.length === 0 ? (
          <div className="review-empty">No changes</div>
        ) : (
          <ul className="file-list">
            {files.map((f) => (
              <li
                key={f.file}
                className={`file-item ${selectedFile === f.file ? 'active' : ''}`}
                onClick={() => setSelectedFile(f.file)}
              >
                <span className={`file-status status-${f.status}`}>{f.status[0].toUpperCase()}</span>
                {f.file}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="review-main">
        {selectedFile ? (
          <DiffViewer worktreeId={selectedWorktree.id} file={selectedFile} />
        ) : (
          <div className="review-placeholder">Select a file to view diff</div>
        )}
      </div>

      <div className="review-commit">
        <CommitPanel worktreeId={selectedWorktree.id} files={files} onCommit={loadFiles} />
      </div>
    </div>
  );
}
