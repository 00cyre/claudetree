import { useState, useEffect } from 'react';
import type { PipelineStatus, PRWatcherStatus } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { CheckCircle2, AlertCircle, GitPullRequest, MessageSquare, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextualToolbarProps {
  worktreeId: string | null;
  pipelineStatus: PipelineStatus | null;
  prWatcherStatus?: PRWatcherStatus | null;
  onEnablePipeline: () => void;
  onDisablePipeline: () => void;
}

function formatElapsed(since: number): string {
  const ms = Date.now() - since;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function PipelineStatusBadge({ status }: { status: PipelineStatus }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = formatElapsed(status.since);

  switch (status.phase) {
    case 'idle':
      return null;
    case 'watching':
      return (
        <Badge variant="secondary" className="gap-1">
          <Spinner className="size-3" />
          Watching CI... ({elapsed})
        </Badge>
      );
    case 'passing':
      return (
        <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          All checks passed
        </Badge>
      );
    case 'failing':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="size-3" />
          CI failed
        </Badge>
      );
    case 'fixing':
      return (
        <Badge variant="secondary" className="gap-1">
          <Spinner className="size-3" />
          Auto-fixing... ({elapsed})
          {status.fixAttempt && (
            <span className="text-muted-foreground">
              ({status.fixAttempt}/{status.maxAttempts})
            </span>
          )}
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="size-3" />
          {status.message}
        </Badge>
      );
  }
}

export function ContextualToolbar({
  worktreeId,
  pipelineStatus,
  prWatcherStatus,
  onEnablePipeline,
  onDisablePipeline,
}: ContextualToolbarProps) {
  if (!worktreeId) return null;

  const isActive = pipelineStatus && pipelineStatus.phase !== 'idle';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2">
        <Eye className="size-3.5 text-muted-foreground" />
        <label htmlFor="pipeline-toggle" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          Watch Pipeline
        </label>
        <Switch
          id="pipeline-toggle"
          size="sm"
          checked={!!isActive}
          onCheckedChange={(checked) => {
            if (checked) onEnablePipeline();
            else onDisablePipeline();
          }}
        />
      </div>

      {pipelineStatus && pipelineStatus.phase !== 'idle' && (
        <PipelineStatusBadge status={pipelineStatus} />
      )}

      {prWatcherStatus && prWatcherStatus.phase !== 'stopped' && (
        <>
          {prWatcherStatus.prNumber && prWatcherStatus.prUrl ? (
            <a
              href={prWatcherStatus.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline"
            >
              <Badge variant="secondary" className="gap-1 cursor-pointer hover:bg-secondary/80">
                <GitPullRequest className="size-3" />
                PR #{prWatcherStatus.prNumber}
              </Badge>
            </a>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <GitPullRequest className="size-3" />
              {prWatcherStatus.message}
            </Badge>
          )}
          {(() => {
            const newComments = prWatcherStatus.notifications
              .filter((n) => !n.dismissed && (n.type === 'new_comment' || n.type === 'new_review'))
              .length;
            if (newComments === 0) return null;
            return (
              <Badge variant="outline" className="gap-1 border-blue-400 text-blue-600 dark:text-blue-400">
                <MessageSquare className="size-3" />
                {newComments}
              </Badge>
            );
          })()}
        </>
      )}
    </div>
  );
}
