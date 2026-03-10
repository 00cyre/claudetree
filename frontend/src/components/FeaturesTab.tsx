import { TerminalView } from '@/components/Terminal';
import { LinearTicketPanel } from '@/components/LinearTicketPanel';
import type { Worktree, LinearIssue, LinearComment } from '@/types';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';

interface FeaturesTabProps {
  selectedWorktree: Worktree | null;
  issue: LinearIssue | null;
  comments: LinearComment[];
  loadingIssue: boolean;
  issueError: string | null;
  effectiveTicketId: string | null;
  onUnlink: () => void;
  onTerminalExit?: () => void;
}

export function FeaturesTab({ selectedWorktree, issue, comments, loadingIssue, issueError, effectiveTicketId, onUnlink, onTerminalExit }: FeaturesTabProps) {
  return (
    <div className="flex flex-col h-full">
      {effectiveTicketId ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0" defaultLayout={{ terminal: 65, ticket: 35 }}>
          <ResizablePanel id="terminal" className="min-h-0">
            <div className="h-full min-h-0 flex flex-col">
              <TerminalView worktreeId={selectedWorktree?.id ?? null} onExit={onTerminalExit} />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="ticket">
            <div className="flex flex-col h-full overflow-hidden">
            {loadingIssue && (
              <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                Loading issue...
              </div>
            )}
            {!loadingIssue && issue && (
                <LinearTicketPanel
                  issue={issue}
                  comments={comments}
                  onUnlink={selectedWorktree?.linearIssueId ? onUnlink : undefined}
                />
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
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <TerminalView worktreeId={selectedWorktree?.id ?? null} onExit={onTerminalExit} />
        </div>
      )}
    </div>
  );
}
