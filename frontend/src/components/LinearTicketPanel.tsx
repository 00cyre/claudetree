import Markdown from 'react-markdown';
import type { LinearIssue, LinearComment } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

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
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <a
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {issue.identifier} <ExternalLinkIcon />
          </a>
          {issue.team && (
            <Badge variant="secondary" className="text-xs">{issue.team}</Badge>
          )}
        </div>
        {onUnlink && (
          <Button size="icon-xs" variant="ghost" className="text-muted-foreground hover:text-destructive"
            onClick={onUnlink} title="Unlink issue">
            ×
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <h3 className="text-base font-semibold text-foreground">{issue.title}</h3>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{issue.status}</Badge>
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: PRIORITY_COLORS[issue.priority] ?? '#8b949e' }}
            >
              {issue.priorityLabel}
            </Badge>
            {issue.labels.map((label) => (
              <Badge key={label} variant="outline" className="text-xs">{label}</Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {issue.assignee && (
              <>
                <span className="text-muted-foreground">Assignee</span>
                <span>{issue.assignee}</span>
              </>
            )}
            {issue.project && (
              <>
                <span className="text-muted-foreground">Project</span>
                <span>{issue.project}</span>
              </>
            )}
            {issue.projectMilestone && (
              <>
                <span className="text-muted-foreground">Milestone</span>
                <span>{issue.projectMilestone}</span>
              </>
            )}
            {issue.createdBy && (
              <>
                <span className="text-muted-foreground">Created by</span>
                <span>{issue.createdBy}</span>
              </>
            )}
            {issue.dueDate && (
              <>
                <span className="text-muted-foreground">Due</span>
                <span>{new Date(issue.dueDate).toLocaleDateString()}</span>
              </>
            )}
            {issue.createdAt && (
              <>
                <span className="text-muted-foreground">Created</span>
                <span>{timeAgo(issue.createdAt)}</span>
              </>
            )}
            {issue.updatedAt && (
              <>
                <span className="text-muted-foreground">Updated</span>
                <span>{timeAgo(issue.updatedAt)}</span>
              </>
            )}
          </div>

          {issue.attachments && issue.attachments.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Resources</div>
              <div className="flex flex-col gap-1">
                {issue.attachments.map((att) => (
                  <a
                    key={att.id}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GitBranchIcon />
                    <span>{att.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {issue.description && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Description</div>
              <div className="text-sm [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_a]:text-primary [&_a]:underline">
                <Markdown>{issue.description}</Markdown>
              </div>
            </div>
          )}

          {comments.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Activity</div>
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-md border border-border p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{comment.author}</span>
                      <span className="text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <div className="text-sm [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_a]:text-primary [&_a]:underline">
                      <Markdown>{comment.body}</Markdown>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
