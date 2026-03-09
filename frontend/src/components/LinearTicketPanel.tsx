import type { LinearIssue } from '../types/index.js';

interface LinearTicketPanelProps {
  issue: LinearIssue;
  onUnlink?: () => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#f85149',
  2: '#f0883e',
  3: '#d29922',
  4: '#8b949e',
};

export function LinearTicketPanel({ issue, onUnlink }: LinearTicketPanelProps) {
  return (
    <div className="linear-ticket-panel">
      <div className="ticket-header">
        <a
          className="ticket-identifier"
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {issue.identifier}
        </a>
        {onUnlink && (
          <button className="btn-delete" onClick={onUnlink} title="Unlink issue">
            x
          </button>
        )}
      </div>

      <h3 className="ticket-title">{issue.title}</h3>

      <div className="ticket-meta">
        <span className="ticket-status-badge">{issue.status}</span>
        <span
          className="ticket-priority-badge"
          style={{ borderColor: PRIORITY_COLORS[issue.priority] ?? '#8b949e' }}
        >
          {issue.priorityLabel}
        </span>
      </div>

      {issue.assignee && (
        <div className="ticket-field">
          <span className="ticket-field-label">Assignee</span>
          <span className="ticket-field-value">{issue.assignee}</span>
        </div>
      )}

      {issue.labels.length > 0 && (
        <div className="ticket-field">
          <span className="ticket-field-label">Labels</span>
          <div className="ticket-labels">
            {issue.labels.map((label) => (
              <span key={label} className="ticket-label-chip">{label}</span>
            ))}
          </div>
        </div>
      )}

      {issue.description && (
        <div className="ticket-description">
          <span className="ticket-field-label">Description</span>
          <div className="ticket-description-content">{issue.description}</div>
        </div>
      )}
    </div>
  );
}
