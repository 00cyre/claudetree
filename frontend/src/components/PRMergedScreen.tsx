import { useEffect } from 'react';
import type { Worktree, PRNotification, PRMergedMeta } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ArrowRight, ExternalLink, Archive } from 'lucide-react';
import { extractTicketIdFromBranch } from '@/utils/linear';

interface PRMergedScreenProps {
  worktree: Worktree;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  notification: PRNotification;
  onArchive: () => void;
  archiving?: boolean;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PRMergedScreen({ worktree, prNumber, prTitle, prUrl, notification, onArchive, archiving }: PRMergedScreenProps) {
  const meta = (notification.meta ?? {}) as unknown as PRMergedMeta;
  const ticketId = extractTicketIdFromBranch(worktree.branch);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'a') {
        e.preventDefault();
        if (!archiving) onArchive();
      }
      if (e.metaKey && e.key === 'g') {
        e.preventDefault();
        window.open(prUrl, '_blank');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [archiving, onArchive, prUrl]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      {/* Checkmark */}
      <div className="flex items-center justify-center size-24 rounded-full bg-emerald-500/20">
        <CheckCircle2 className="size-12 text-emerald-500" />
      </div>

      {/* Title */}
      <h2 className="text-2xl font-semibold text-center">
        PR #{prNumber} Merged Successfully
      </h2>

      {/* Subtitle */}
      <p className="text-sm text-muted-foreground text-center max-w-md">
        This worktree has completed its task. You can archive it to clean up or view the merged PR on GitHub.
      </p>

      {/* Branch flow */}
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>{worktree.branch}</span>
        <ArrowRight className="size-3" />
        <span>{meta.baseBranch || 'unknown'}</span>
      </div>

      {/* Merge Details Card */}
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <span className="text-sm font-medium">Merge Details</span>
          {meta.mergedAt && (
            <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
              {formatRelativeTime(meta.mergedAt)}
            </span>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {ticketId && (
            <>
              <span className="text-muted-foreground">Ticket</span>
              <a
                href={`https://linear.app/search?q=${encodeURIComponent(ticketId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {ticketId.toUpperCase()}
              </a>
            </>
          )}
          <span className="text-muted-foreground">PR</span>
          <span>{prTitle}</span>
          <span className="text-muted-foreground">Branch</span>
          <span className="font-mono text-xs">{worktree.branch}</span>
          <span className="text-muted-foreground">Merged by</span>
          <span>{meta.mergedBy || 'Unknown'}</span>
          <span className="text-muted-foreground">Commits</span>
          <span>{meta.commitCount ?? 0}</span>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <Button variant="success" onClick={onArchive} disabled={archiving}>
          <Archive className="size-4" />
          {archiving ? 'Archiving...' : 'Archive Worktree'}
        </Button>
        <Button variant="outline" asChild>
          <a href={prUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            View on GitHub
          </a>
        </Button>
      </div>

      {/* Keyboard hints */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">⌘A</kbd>
        <span>archive</span>
        <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">⌘G</kbd>
        <span>github</span>
      </div>
    </div>
  );
}
