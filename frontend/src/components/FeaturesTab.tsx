import { useMemo } from 'react';
import { TabbedTerminalView } from '@/components/TabbedTerminal';
import { LinearTicketPanel } from '@/components/LinearTicketPanel';
import { TerminalNotifications } from '@/components/TerminalNotifications';
import { PRMergedScreen } from '@/components/PRMergedScreen';
import { PRReviewPanel } from '@/components/PRReviewPanel';
import { NarrativeViewer } from '@/components/NarrativeViewer';
import { ReviewToolbox } from '@/components/ReviewToolbox';
import { extractTicketIdFromBranch } from '@/utils/linear';
import type { Worktree, LinearIssue, LinearComment, PRWatcherStatus, PipelineStatus, DevStep, TicketContext, SessionStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface FeaturesTabProps {
  selectedWorktree: Worktree | null;
  issue: LinearIssue | null;
  comments: LinearComment[];
  loadingIssue: boolean;
  issueError: string | null;
  effectiveTicketId: string | null;
  onUnlink: () => void;
  onTerminalExit?: () => void;
  prWatcherStatus?: PRWatcherStatus | null;
  pipelineStatus?: PipelineStatus | null;
  onDismissPRNotification?: (id: string) => void;
  onEnablePipeline?: () => void;
  onDisablePipeline?: () => void;
  onArchiveWorktree?: () => void;
  archivingWorktree?: boolean;
  currentStep: DevStep;
  aiConnected: boolean;
  branches: string[];
  baseBranch: string;
  sessionStatuses: Map<string, SessionStatus>;
}

export function FeaturesTab({
  selectedWorktree,
  issue,
  comments,
  loadingIssue,
  issueError,
  effectiveTicketId,
  onUnlink,
  onTerminalExit,
  prWatcherStatus,
  pipelineStatus,
  onDismissPRNotification,
  onEnablePipeline,
  onDisablePipeline,
  onArchiveWorktree,
  archivingWorktree,
  currentStep,
  aiConnected,
  branches,
  baseBranch,
  sessionStatuses,
}: FeaturesTabProps) {
  const activeNotifications = prWatcherStatus?.notifications.filter((n) => !n.dismissed) ?? [];
  const mergedNotification = prWatcherStatus?.notifications.find(n => n.type === 'pr_merged');

  const ticketContext = useMemo<TicketContext | undefined>(() => {
    if (!issue || !selectedWorktree) return undefined;
    const expectedId = selectedWorktree.linearIssueId ?? extractTicketIdFromBranch(selectedWorktree.name);
    if (!expectedId) return undefined;
    if (issue.identifier.toLowerCase() !== expectedId.toLowerCase()) return undefined;
    return { id: issue.identifier, title: issue.title, description: issue.description };
  }, [issue?.identifier, issue?.title, issue?.description, selectedWorktree?.id, selectedWorktree?.linearIssueId, selectedWorktree?.name]);

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex-1 min-h-0 flex flex-col min-w-0">
        {currentStep === 'dev' && (
          <>
            {effectiveTicketId ? (
              <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
                <ResizablePanel id="terminal" className="min-h-0">
                  <div className="h-full min-h-0 flex flex-col relative">
                    <TabbedTerminalView worktreeId={selectedWorktree?.id ?? null} sessionStatuses={sessionStatuses} onExit={onTerminalExit} />
                    {activeNotifications.length > 0 && onDismissPRNotification && (
                      <TerminalNotifications notifications={prWatcherStatus!.notifications} onDismiss={onDismissPRNotification} />
                    )}
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="ticket" className="min-h-0">
                  <div className="flex flex-col h-full min-h-0 overflow-hidden">
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
              <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
                <TabbedTerminalView worktreeId={selectedWorktree?.id ?? null} sessionStatuses={sessionStatuses} onExit={onTerminalExit} />
                {activeNotifications.length > 0 && onDismissPRNotification && (
                  <TerminalNotifications notifications={prWatcherStatus!.notifications} onDismiss={onDismissPRNotification} />
                )}
              </div>
            )}
          </>
        )}

        {currentStep === 'review' && selectedWorktree && (
          <div className="flex-1 min-h-0 relative">
            <NarrativeViewer
              worktreeId={selectedWorktree.id}
              baseBranch={baseBranch}
              aiConnected={aiConnected}
              ticketContext={ticketContext}
            />
            <ReviewToolbox
              worktreeId={selectedWorktree.id}
              branches={branches}
            />
          </div>
        )}

        {currentStep === 'review' && !selectedWorktree && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a worktree to review changes
          </div>
        )}

        {currentStep === 'pr' && selectedWorktree && (
          <PRReviewPanel worktreeId={selectedWorktree.id} />
        )}

        {currentStep === 'pr' && !selectedWorktree && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a worktree to view PR details.
          </div>
        )}

        {currentStep === 'merged' && selectedWorktree && mergedNotification && prWatcherStatus?.prNumber && (
          <PRMergedScreen
            worktree={selectedWorktree}
            prNumber={prWatcherStatus.prNumber}
            prTitle={prWatcherStatus.prTitle || `PR #${prWatcherStatus.prNumber}`}
            prUrl={prWatcherStatus.prUrl || ''}
            notification={mergedNotification}
            onArchive={onArchiveWorktree || (() => {})}
            archiving={archivingWorktree}
          />
        )}

        {currentStep === 'merged' && (!mergedNotification || !prWatcherStatus?.prNumber) && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No merged PR data available for this worktree.
          </div>
        )}
      </div>
    </div>
  );
}
