import { useState } from 'react';

interface NewWorktreeModalProps {
  onClose: () => void;
  onCreate: (name: string, linearIssueId?: string) => Promise<void>;
  onAddProject: (path: string) => Promise<void>;
  hasProject: boolean;
  linearConnected: boolean;
}

function extractIssueId(input: string): string {
  const trimmed = input.trim();
  // Extract from Linear URL: https://linear.app/team/issue/PROJ-123/slug
  const urlMatch = trimmed.match(/\/issue\/([\w]+-\d+)/);
  if (urlMatch) return urlMatch[1];
  // Already an identifier like PROJ-123
  if (/^[\w]+-\d+$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function NewWorktreeModal({ onClose, onCreate, onAddProject, hasProject, linearConnected }: NewWorktreeModalProps) {
  const [name, setName] = useState('');
  const [linearIssueId, setLinearIssueId] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const issueId = linearIssueId.trim() ? extractIssueId(linearIssueId) : undefined;
      await onCreate(name.trim(), issueId);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = async () => {
    if (!projectPath.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onAddProject(projectPath.trim());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New Worktree</h3>

        {!hasProject && (
          <div className="modal-section">
            <label>Project path (git repository)</label>
            <div className="modal-row">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/repo"
              />
              <button className="btn" onClick={handleAddProject} disabled={loading}>Add</button>
            </div>
          </div>
        )}

        <div className="modal-section">
          <label>Feature name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-feature"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        {linearConnected && (
          <div className="modal-section">
            <label>Linear issue (optional)</label>
            <input
              type="text"
              value={linearIssueId}
              onChange={(e) => setLinearIssueId(e.target.value)}
              placeholder="PROJ-123 or paste Linear URL"
            />
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={loading || !name.trim() || !hasProject}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
