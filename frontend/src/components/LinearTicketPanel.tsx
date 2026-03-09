import Markdown from 'react-markdown';
import type { LinearIssue, LinearComment } from '../types/index.js';

interface LinearTicketPanelProps {
  issue: LinearIssue;
  comments: LinearComment[];
  onUnlink?: () => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#f85149',
  2: '#f0883e',
  3: '#d29922',
  4: '#8b949e',
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

function GitBranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.75 2A1.75 1.75 0 0 0 2 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.25v-3.5a.75.75 0 0 0-1.5 0v3.5a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-8.5a.25.25 0 0 1 .25-.25h3.5a.75.75 0 0 0 0-1.5h-3.5zm6.25 0a.75.75 0 0 0 0 1.5h2.19L6.22 9.47a.75.75 0 0 0 1.06 1.06l5.97-5.97v2.19a.75.75 0 0 0 1.5 0V2.75a.75.75 0 0 0-.75-.75H10z" />
    </svg>
  );
}

export function LinearTicketPanel({ issue, comments, onUnlink }: LinearTicketPanelProps) {
  return (
    <div className="linear-ticket-panel">
      {/* Header bar */}
      <div className="ticket-top-bar">
        <div className="ticket-top-left">
          <a
            className="ticket-identifier"
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {issue.identifier} <ExternalLinkIcon />
          </a>
          {issue.team && <span className="ticket-team-badge">{issue.team}</span>}
        </div>
        {onUnlink && (
          <button className="btn-delete" onClick={onUnlink} title="Unlink issue">
            &times;
          </button>
        )}
      </div>

      <div className="ticket-scrollable">
        {/* Title */}
        <h3 className="ticket-title">{issue.title}</h3>

        {/* Status row */}
        <div className="ticket-meta">
          <span className="ticket-status-badge">{issue.status}</span>
          <span
            className="ticket-priority-badge"
            style={{ borderColor: PRIORITY_COLORS[issue.priority] ?? '#8b949e' }}
          >
            {issue.priorityLabel}
          </span>
          {issue.labels.map((label) => (
            <span key={label} className="ticket-label-chip">{label}</span>
          ))}
        </div>

        {/* Properties grid */}
        <div className="ticket-props">
          {issue.assignee && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Assignee</span>
              <span className="ticket-prop-value">{issue.assignee}</span>
            </div>
          )}
          {issue.project && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Project</span>
              <span className="ticket-prop-value">{issue.project}</span>
            </div>
          )}
          {issue.projectMilestone && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Milestone</span>
              <span className="ticket-prop-value">{issue.projectMilestone}</span>
            </div>
          )}
          {issue.createdBy && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Created by</span>
              <span className="ticket-prop-value">{issue.createdBy}</span>
            </div>
          )}
          {issue.dueDate && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Due</span>
              <span className="ticket-prop-value">{new Date(issue.dueDate).toLocaleDateString()}</span>
            </div>
          )}
          {issue.createdAt && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Created</span>
              <span className="ticket-prop-value">{timeAgo(issue.createdAt)}</span>
            </div>
          )}
          {issue.updatedAt && (
            <div className="ticket-prop">
              <span className="ticket-prop-label">Updated</span>
              <span className="ticket-prop-value">{timeAgo(issue.updatedAt)}</span>
            </div>
          )}
        </div>

        {/* Attachments (PRs, links) */}
        {issue.attachments && issue.attachments.length > 0 && (
          <div className="ticket-section">
            <div className="ticket-section-label">Resources</div>
            <div className="ticket-attachments">
              {issue.attachments.map((att) => (
                <a
                  key={att.id}
                  className="ticket-attachment"
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitBranchIcon />
                  <span className="ticket-attachment-title">{att.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Description — rendered as markdown */}
        {issue.description && (
          <div className="ticket-section">
            <div className="ticket-section-label">Description</div>
            <div className="ticket-markdown">
              <Markdown>{issue.description}</Markdown>
            </div>
          </div>
        )}

        {/* Comments / Activity */}
        {comments.length > 0 && (
          <div className="ticket-section">
            <div className="ticket-section-label">Activity</div>
            <div className="ticket-comments">
              {comments.map((comment) => (
                <div key={comment.id} className="ticket-comment">
                  <div className="ticket-comment-header">
                    <span className="ticket-comment-author">{comment.author}</span>
                    <span className="ticket-comment-time">{timeAgo(comment.createdAt)}</span>
                  </div>
                  <div className="ticket-markdown ticket-comment-body">
                    <Markdown>{comment.body}</Markdown>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
