import type { Project, Worktree, LinearStatus, AIStatus } from '../types/index.js';
import { extractTicketIdFromBranch } from '../utils/linear.js';

interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (p: Project) => void;
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  onSelectWorktree: (w: Worktree) => void;
  onNewWorktree: () => void;
  onDeleteWorktree: (id: string) => void;
  loading: boolean;
  linearStatus: LinearStatus;
  onLinearSetup: () => void;
  aiStatus: AIStatus;
  onAISetup: () => void;
}

export function Sidebar({
  projects,
  selectedProject,
  onSelectProject,
  worktrees,
  selectedWorktree,
  onSelectWorktree,
  onNewWorktree,
  onDeleteWorktree,
  loading,
  linearStatus,
  onLinearSetup,
  aiStatus,
  onAISetup,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <label className="sidebar-label">Project</label>
        <select
          className="sidebar-select"
          value={selectedProject?.id || ''}
          onChange={(e) => {
            const p = projects.find((p) => p.id === e.target.value);
            if (p) onSelectProject(p);
          }}
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="sidebar-section sidebar-section-grow">
        <div className="sidebar-header">
          <label className="sidebar-label">Worktrees</label>
          <button className="btn btn-sm" onClick={onNewWorktree}>+ New</button>
        </div>

        {loading ? (
          <div className="sidebar-empty">Loading...</div>
        ) : worktrees.length === 0 ? (
          <div className="sidebar-empty">No worktrees</div>
        ) : (
          <ul className="worktree-list">
            {worktrees.map((wt) => {
              const ticketId = wt.linearIssueId ?? extractTicketIdFromBranch(wt.name);
              return (
              <li
                key={wt.id}
                className={`worktree-item ${selectedWorktree?.id === wt.id ? 'active' : ''}`}
                onClick={() => onSelectWorktree(wt)}
              >
                <div className="worktree-item-info">
                  <span className="worktree-name">{wt.name}</span>
                  {ticketId && (
                    <span className="linear-badge" title={ticketId}>{ticketId}</span>
                  )}
                </div>
                <button
                  className="btn-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteWorktree(wt.id); }}
                  title="Remove worktree"
                >
                  x
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="sidebar-footer">
        <button
          className={`btn btn-sm linear-setup-btn ${linearStatus.connected ? 'connected' : ''}`}
          onClick={onLinearSetup}
        >
          {linearStatus.connected ? 'Linear connected' : 'Connect Linear'}
        </button>
        <button
          className={`btn btn-sm ai-setup-btn ${aiStatus.connected ? 'connected' : ''}`}
          onClick={onAISetup}
        >
          {aiStatus.connected ? 'AI connected' : 'Connect AI'}
        </button>
      </div>
    </aside>
  );
}
