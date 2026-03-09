import { TerminalView } from '@/components/Terminal';
import { LinearTicketPanel } from '@/components/LinearTicketPanel';
import type { Worktree, LinearIssue, LinearComment } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface FeaturesTabProps {
  selectedWorktree: Worktree | null;
  issue: LinearIssue | null;
  comments: LinearComment[];
  loadingIssue: boolean;
  issueError: string | null;
  effectiveTicketId: string | null;
  onUnlink: () => void;
}

export function FeaturesTab({ selectedWorktree, issue, comments, loadingIssue, issueError, effectiveTicketId, onUnlink }: FeaturesTabProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <TerminalView worktreeId={selectedWorktree?.id ?? null} />
        </div>
        {effectiveTicketId && (
          <div className="w-80 min-w-80 flex flex-col border-l border-border overflow-hidden">
            {loadingIssue && (
              <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                Loading issue...
              </div>
            )}
            {!loadingIssue && issue && (
              <ScrollArea className="flex-1">
                <LinearTicketPanel
                  issue={issue}
                  comments={comments}
                  onUnlink={selectedWorktree?.linearIssueId ? onUnlink : undefined}
                />
              </ScrollArea>
            )}
            {!loadingIssue && issueError && (
              <div className="p-4 space-y-2">
                <div className="text-sm font-medium">Could not load issue</div>
                <div className="text-sm text-muted-foreground">{issueError}</div>
                <a
                  className="text-sm text-primary hover:underline block"
                  href={`https://linear.app/search?q=${encodeURIComponent(effectiveTicketId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open {effectiveTicketId} in Linear
                </a>
                {selectedWorktree?.linearIssueId && (
                  <Button size="sm" variant="outline" onClick={onUnlink} className="mt-2">
                    Unlink
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
