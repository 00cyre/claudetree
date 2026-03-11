import { useMemo } from 'react';
import type { Worktree, LinearIssue, TicketContext } from '@/types';
import { NarrativeViewer } from '@/components/NarrativeViewer';
import { ReviewToolbox } from '@/components/ReviewToolbox';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { extractTicketIdFromBranch } from '@/utils/linear';

interface ReviewTabProps {
  selectedWorktree: Worktree | null;
  aiConnected: boolean;
  issue?: LinearIssue | null;
  refreshKey?: number;
  branches: string[];
  baseBranch: string;
}

export function ReviewTab({ selectedWorktree, aiConnected, issue, branches, baseBranch }: ReviewTabProps) {
  // Only use the issue as ticket context if it actually belongs to this worktree.
  // When switching worktrees, `issue` can briefly hold the previous worktree's data.
  const ticketContext = useMemo<TicketContext | undefined>(() => {
    if (!issue || !selectedWorktree) return undefined;
    const expectedId = selectedWorktree.linearIssueId ?? extractTicketIdFromBranch(selectedWorktree.name);
    if (!expectedId) return undefined;
    if (issue.identifier.toLowerCase() !== expectedId.toLowerCase()) return undefined;
    return { id: issue.identifier, title: issue.title, description: issue.description };
  }, [issue?.identifier, issue?.title, issue?.description, selectedWorktree?.id, selectedWorktree?.linearIssueId, selectedWorktree?.name]);

  if (!selectedWorktree) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a worktree to review changes
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel id="narrative" defaultSize={75}>
        <NarrativeViewer
          worktreeId={selectedWorktree.id}
          baseBranch={baseBranch}
          aiConnected={aiConnected}
          ticketContext={ticketContext}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="toolbox" defaultSize={25}>
        <div className="flex flex-col h-full overflow-hidden">
          <ReviewToolbox
            worktreeId={selectedWorktree.id}
            branches={branches}
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
