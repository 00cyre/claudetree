import { useState, useEffect } from 'react';
import { api } from '../api/client.js';

interface DiffViewerProps {
  worktreeId: string;
  file: string;
}

export function DiffViewer({ worktreeId, file }: DiffViewerProps) {
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getFileDiff(worktreeId, file)
      .then((data) => setDiff(data.diff))
      .catch((err) => setDiff(`Error loading diff: ${err}`))
      .finally(() => setLoading(false));
  }, [worktreeId, file]);

  if (loading) return <div className="diff-loading">Loading diff...</div>;
  if (!diff) return <div className="diff-empty">No changes</div>;

  const lines = diff.split('\n');

  return (
    <div className="diff-viewer">
      <div className="diff-header">{file}</div>
      <pre className="diff-content">
        {lines.map((line, i) => {
          let className = 'diff-line';
          if (line.startsWith('+') && !line.startsWith('+++')) className += ' diff-add';
          else if (line.startsWith('-') && !line.startsWith('---')) className += ' diff-remove';
          else if (line.startsWith('@@')) className += ' diff-hunk';
          return (
            <div key={i} className={className}>{line}</div>
          );
        })}
      </pre>
    </div>
  );
}
