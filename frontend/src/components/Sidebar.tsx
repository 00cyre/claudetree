import type { Project, Worktree } from '../types/index.js';

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

      <div className="sidebar-section">
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
            {worktrees.map((wt) => (
              <li
                key={wt.id}
                className={`worktree-item ${selectedWorktree?.id === wt.id ? 'active' : ''}`}
                onClick={() => onSelectWorktree(wt)}
              >
                <span className="worktree-name">{wt.name}</span>
                <button
                  className="btn-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteWorktree(wt.id); }}
                  title="Remove worktree"
                >
                  x
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
