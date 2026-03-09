import { TerminalView } from './Terminal.js';
import { LinearTicketPanel } from './LinearTicketPanel.js';
import type { Worktree, LinearIssue } from '../types/index.js';

interface FeaturesTabProps {
  selectedWorktree: Worktree | null;
  issue: LinearIssue | null;
  loadingIssue: boolean;
  issueError: string | null;
  effectiveTicketId: string | null;
  onUnlink: () => void;
}

export function FeaturesTab({ selectedWorktree, issue, loadingIssue, issueError, effectiveTicketId, onUnlink }: FeaturesTabProps) {
  return (
    <div className="features-tab">
      <div className="features-header">
        {selectedWorktree ? (
          <h3>
            {selectedWorktree.name}
            <span className="branch-badge">{selectedWorktree.branch}</span>
            {effectiveTicketId && (
              <span className="linear-badge-header">{effectiveTicketId}</span>
            )}
          </h3>
        ) : (
          <h3>Select a worktree</h3>
        )}
      </div>
      <div className="features-body features-body-split">
        <div className="features-terminal-section">
          <TerminalView worktreeId={selectedWorktree?.id ?? null} />
        </div>
        {effectiveTicketId && (
          <div className="features-ticket-section">
            {loadingIssue && (
              <div className="linear-ticket-panel linear-ticket-loading">Loading issue...</div>
            )}
            {!loadingIssue && issue && (
              <LinearTicketPanel
                issue={issue}
                onUnlink={selectedWorktree?.linearIssueId ? onUnlink : undefined}
              />
            )}
            {!loadingIssue && issueError && (
              <div className="linear-ticket-panel linear-ticket-error">
                <div className="ticket-error-title">Could not load issue</div>
                <div className="ticket-error-message">{issueError}</div>
                <a
                  className="ticket-error-link"
                  href={`https://linear.app/search?q=${encodeURIComponent(effectiveTicketId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open {effectiveTicketId} in Linear
                </a>
                {selectedWorktree?.linearIssueId && (
                  <button className="btn btn-sm" onClick={onUnlink} style={{ marginTop: 8 }}>
                    Unlink
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
