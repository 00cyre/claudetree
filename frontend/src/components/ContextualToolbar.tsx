import { useState, useEffect } from 'react';
import type { PipelineStatus, Tab } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useSidebar } from '@/components/ui/sidebar';
import { CheckCircle2, AlertCircle, ArrowUpCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextualToolbarProps {
  worktreeId: string | null;
  pipelineStatus: PipelineStatus | null;
  onEnablePipeline: () => void;
  onDisablePipeline: () => void;
  onApprovePipeline: () => void;
  onRejectPipeline: () => void;
  tab: Tab;
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

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = formatElapsed(status.since);

  switch (status.phase) {
    case 'idle':
      return null;
    case 'pushing':
      return (
        <Badge variant="secondary" className="gap-1">
          <ArrowUpCircle className="size-3" />
          Pushing... ({elapsed})
        </Badge>
      );
    case 'waiting':
      return (
        <Badge variant="secondary" className="gap-1">
          <Spinner className="size-3" />
          CI running... ({elapsed})
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
          Fixing... ({elapsed})
          {status.fixAttempt && (
            <span className="text-muted-foreground">
              ({status.fixAttempt}/{status.maxAttempts})
            </span>
          )}
        </Badge>
      );
    case 'confirming':
      return (
        <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600 dark:text-amber-400">
          <Clock className="size-3" />
          Awaiting approval
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
  onEnablePipeline,
  onDisablePipeline,
  onApprovePipeline,
  onRejectPipeline,
}: ContextualToolbarProps) {
  const { state } = useSidebar();
  const sidebarWidth = state === 'collapsed'
    ? 'var(--sidebar-width-icon)'
    : 'var(--sidebar-width)';

  if (!worktreeId) return null;

  const isActive = pipelineStatus && pipelineStatus.phase !== 'idle';
  const isConfirming = pipelineStatus?.phase === 'confirming';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30',
        'transition-[padding-left] duration-200 ease-linear',
      )}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="pipeline-toggle" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Watch Pipeline
        </label>
        <Switch
          id="pipeline-toggle"
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

      {isConfirming && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">Push fix?</span>
          <Button size="xs" variant="default" onClick={onApprovePipeline}>
            Push
          </Button>
          <Button size="xs" variant="ghost" onClick={onRejectPipeline}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
