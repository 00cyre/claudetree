import { useState } from 'react';
import type { ChangedFile } from '../types/index.js';
import { api } from '../api/client.js';

interface CommitPanelProps {
  worktreeId: string;
  files: ChangedFile[];
  onCommit: () => void;
}

export function CommitPanel({ worktreeId, files, onCommit }: CommitPanelProps) {
  const [message, setMessage] = useState('');
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  const toggleFile = (file: string) => {
    setStaged((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const toggleAll = () => {
    if (staged.size === files.length) {
      setStaged(new Set());
    } else {
      setStaged(new Set(files.map((f) => f.file)));
    }
  };

  const handleCommit = async () => {
    if (!message.trim()) return;
    setCommitting(true);
    try {
      await api.commit(worktreeId, message, Array.from(staged));
      setMessage('');
      setStaged(new Set());
      onCommit();
    } catch (err) {
      console.error('Commit failed:', err);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="commit-panel">
      <h4>Commit</h4>
      <div className="commit-files">
        <label className="commit-toggle-all">
          <input
            type="checkbox"
            checked={staged.size === files.length && files.length > 0}
            onChange={toggleAll}
          />
          Select all
        </label>
        {files.map((f) => (
          <label key={f.file} className="commit-file">
            <input
              type="checkbox"
              checked={staged.has(f.file)}
              onChange={() => toggleFile(f.file)}
            />
            <span className={`file-status status-${f.status}`}>{f.status[0].toUpperCase()}</span>
            {f.file}
          </label>
        ))}
      </div>
      <textarea
        className="commit-message"
        placeholder="Commit message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
      />
      <button
        className="btn btn-commit"
        onClick={handleCommit}
        disabled={committing || !message.trim() || staged.size === 0}
      >
        {committing ? 'Committing...' : 'Commit'}
      </button>
    </div>
  );
}
