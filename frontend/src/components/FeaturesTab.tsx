import { TerminalView } from './Terminal.js';
import type { Worktree } from '../types/index.js';

interface FeaturesTabProps {
  selectedWorktree: Worktree | null;
}

export function FeaturesTab({ selectedWorktree }: FeaturesTabProps) {
  return (
    <div className="features-tab">
      <div className="features-header">
        {selectedWorktree ? (
          <h3>{selectedWorktree.name} <span className="branch-badge">{selectedWorktree.branch}</span></h3>
        ) : (
          <h3>Select a worktree</h3>
        )}
      </div>
      <TerminalView worktreeId={selectedWorktree?.id ?? null} />
    </div>
  );
}
