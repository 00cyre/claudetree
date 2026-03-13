import { useCallback } from 'react';
import { api } from '@/api/client';
import { TerminalView } from '@/components/Terminal';
import { usePRDetails } from '@/hooks/usePRDetails';
import type { PRCheck } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { GitPullRequest, CheckCircle2, AlertCircle, Circle, ArrowRight, MessageSquare, BotMessageSquare, Eye } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function reviewBadgeVariant(state: string): string {
  switch (state) {
    case 'APPROVED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'CHANGES_REQUESTED': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'COMMENTED': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'PENDING': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default: return 'bg-muted text-muted-foreground';
  }
}

function ReviewStatusIcon({ state }: { state: string }) {
  switch (state) {
    case 'APPROVED': return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    case 'CHANGES_REQUESTED': return <AlertCircle className="size-3.5 text-red-500" />;
    case 'COMMENTED': return <MessageSquare className="size-3.5 text-blue-500" />;
    case 'DISMISSED': return <Circle className="size-3.5 text-muted-foreground" />;
    default: return <Circle className="size-3.5 text-amber-500" />;
  }
}

function checkIndicatorStyle(check: PRCheck): string {
  const s = check.status?.toUpperCase();
  const c = check.conclusion?.toUpperCase();
  if (s !== 'COMPLETED') {
    if (s === 'IN_PROGRESS') return 'border-amber-500 bg-amber-500/10';
    return 'border-muted-foreground/30 bg-transparent';
  }
  switch (c) {
    case 'SUCCESS': return 'border-emerald-500 bg-emerald-500/10';
    case 'FAILURE': return 'border-red-500 bg-red-500/10';
    case 'SKIPPED': return 'border-muted-foreground/30 bg-muted/30';
    default: return 'border-muted-foreground/30 bg-transparent';
  }
}

function checkLineStyle(check: PRCheck): string {
  const s = check.status?.toUpperCase();
  const c = check.conclusion?.toUpperCase();
  if (s !== 'COMPLETED') return 'bg-muted-foreground/20';
  switch (c) {
    case 'SUCCESS': return 'bg-emerald-500';
    case 'FAILURE': return 'bg-red-500';
    default: return 'bg-muted-foreground/20';
  }
}

function CheckIcon({ check }: { check: PRCheck }) {
  const s = check.status?.toUpperCase();
  const c = check.conclusion?.toUpperCase();
  if (s !== 'COMPLETED') {
    if (s === 'IN_PROGRESS') return <Spinner className="size-3" />;
    return <Circle className="size-3 text-muted-foreground" />;
  }
  switch (c) {
    case 'SUCCESS': return <CheckCircle2 className="size-3 text-emerald-500" />;
    case 'FAILURE': return <AlertCircle className="size-3 text-red-500" />;
    case 'SKIPPED': return <Circle className="size-3 text-muted-foreground/50" />;
    default: return <Circle className="size-3 text-muted-foreground" />;
  }
}

function checkBadgeColor(check: PRCheck): string {
  const s = check.status?.toUpperCase();
  const c = check.conclusion?.toUpperCase();
  if (s !== 'COMPLETED') {
    if (s === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-muted text-muted-foreground';
  }
  switch (c) {
    case 'SUCCESS': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'FAILURE': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default: return 'bg-muted text-muted-foreground';
  }
}

function checkStatusLabel(check: PRCheck): string {
  const s = check.status?.toUpperCase();
  const c = check.conclusion?.toUpperCase();
  if (s !== 'COMPLETED') {
    if (s === 'IN_PROGRESS') return 'Running';
    return 'Waiting';
  }
  switch (c) {
    case 'SUCCESS': return 'Passed';
    case 'FAILURE': return 'Failed';
    case 'SKIPPED': return 'Skipped';
    case 'NEUTRAL': return 'Neutral';
    case 'CANCELLED': return 'Cancelled';
    case 'TIMED_OUT': return 'Timed out';
    default: return c || 'Unknown';
  }
}

function PipelineVerticalStepper({ checks }: { checks: PRCheck[] }) {
  return (
    <div>
      {checks.map((check, i) => {
        const isLast = i === checks.length - 1;
        return (
          <div key={check.name} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <div className={cn(
                'size-5 rounded-full border-2 flex items-center justify-center shrink-0',
                checkIndicatorStyle(check),
              )}>
                <CheckIcon check={check} />
              </div>
              {!isLast && (
                <div className={cn('w-0.5 flex-1 min-h-4', checkLineStyle(check))} />
              )}
            </div>
            <div className={cn('flex items-center gap-2 min-w-0 flex-1', !isLast ? 'pb-3' : '')}>
              <span className="text-xs font-medium truncate flex-1">{check.name}</span>
              {check.startedAt && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDuration(check.startedAt, check.completedAt)}
                </span>
              )}
              <Badge variant="secondary" className={cn('text-[10px] shrink-0', checkBadgeColor(check))}>
                {checkStatusLabel(check)}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AvatarCircle({ login, avatarUrl, name }: { login: string; avatarUrl?: string; name?: string }) {
  const initials = (name || login).slice(0, 2).toUpperCase();
  return (
    <div className="size-7 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt={login} className="size-7 rounded-full" />
      ) : (
        <span className="text-[10px] font-medium text-muted-foreground">{initials}</span>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex gap-4 flex-1">
        <div className="w-2/5 space-y-3">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <div className="w-3/5">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

interface PRReviewPanelProps {
  worktreeId: string;
  pipelineEnabled?: boolean;
  onTogglePipeline?: (enabled: boolean) => void;
}

export function PRReviewPanel({ worktreeId, pipelineEnabled, onTogglePipeline }: PRReviewPanelProps) {
  const { data, loading, refreshing, error } = usePRDetails(worktreeId);

  const handleAddressWithAI = useCallback(async (commentBody: string, filePath?: string, line?: number) => {
    const location = filePath ? `\nFile: ${filePath}${line ? `:${line}` : ''}` : '';
    const prompt = `Address this PR review comment:${location}\n\n${commentBody}\n`;
    try {
      await api.sendTerminalCommand(worktreeId, prompt);
    } catch {
      // Terminal may not be available
    }
  }, [worktreeId]);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {error || 'No PR data available'}
      </div>
    );
  }

  const ciTotal = data.checks.length;
  const ciPassed = data.checks.filter(c => (c.status === 'COMPLETED' || c.status === 'completed') && c.conclusion?.toUpperCase() === 'SUCCESS').length;
  const ciFailed = data.checks.filter(c => (c.status === 'COMPLETED' || c.status === 'completed') && c.conclusion?.toUpperCase() === 'FAILURE').length;

  const ciSummary = ciFailed > 0
    ? `${ciFailed} failing`
    : ciTotal > 0 && ciPassed === ciTotal
      ? 'All passing'
      : ciTotal > 0
        ? `${ciPassed}/${ciTotal} passing`
        : 'No checks';

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border min-w-0">
        <GitPullRequest className="size-5 text-blue-500 shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm shrink-0">PR #{data.number}</span>
            <span className="text-xs text-muted-foreground truncate">{data.title}</span>
            {refreshing && <Spinner className="size-3 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{data.approvalCount} approval{data.approvalCount !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{ciSummary}</span>
            <span>·</span>
            <span>{data.comments.length} comment{data.comments.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="shrink-0">
          <Badge variant="outline" className="font-mono text-[10px] gap-1 max-w-48 truncate">
            <span className="truncate">{data.headRefName}</span> <ArrowRight className="size-2.5 shrink-0" /> <span className="truncate">{data.baseRefName}</span>
          </Badge>
        </div>
      </div>

      {/* Body */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 min-w-0">
        {/* Left: Reviews + Pipelines + Terminal */}
        <ResizablePanel id="pr-left" defaultSize={40} minSize={25}>
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel id="pr-info" defaultSize={50} minSize={20}>
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="text-emerald-500">+{data.additions}</span>
                    <span className="text-red-500">-{data.deletions}</span>
                    <span>{data.changedFiles} file{data.changedFiles !== 1 ? 's' : ''}</span>
                    <span>{data.commitCount} commit{data.commitCount !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Reviews */}
                  <Card>
                    <CardHeader className="pb-2">
                      <span className="text-xs font-medium">Review Status</span>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.reviews.length === 0 && (
                        <p className="text-xs text-muted-foreground">No reviews yet</p>
                      )}
                      {data.reviews.map((r) => (
                        <div key={r.login} className="flex items-center gap-2">
                          <AvatarCircle login={r.login} avatarUrl={r.avatarUrl} name={r.name} />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs font-medium truncate">{r.name || r.login}</span>
                          </div>
                          <Badge variant="secondary" className={cn('text-[10px] gap-1 shrink-0', reviewBadgeVariant(r.state))}>
                            <ReviewStatusIcon state={r.state} />
                            {r.state.replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Pipelines - Vertical Stepper */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Pipelines</span>
                        {onTogglePipeline && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Watch</span>
                            <Switch
                              size="sm"
                              checked={!!pipelineEnabled}
                              onCheckedChange={onTogglePipeline}
                            />
                          </div>
                        )}
                      </div>
                      {onTogglePipeline && (
                        <p className="text-[10px] text-muted-foreground leading-snug mt-1">
                          Auto-fixes build, unit test, and e2e failures by sending logs to Claude Code.
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      {data.checks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No CI checks</p>
                      ) : (
                        <PipelineVerticalStepper checks={data.checks} />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Terminal for addressing changes */}
            <ResizablePanel id="pr-terminal" defaultSize={50} minSize={15}>
              <div className="h-full flex flex-col border-t border-border">
                <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Terminal</span>
                </div>
                <div className="flex-1 min-h-0">
                  <TerminalView worktreeId={worktreeId} />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Comments with actions */}
        <ResizablePanel id="pr-right" defaultSize={60} minSize={30}>
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3 min-w-0 max-w-[600px] overflow-hidden">
              <span className="text-xs font-medium">Comments</span>
              {data.comments.length === 0 && (
                <p className="text-xs text-muted-foreground">No comments yet</p>
              )}
              {data.comments.map((c) => (
                <Card key={c.id} className="min-w-0 overflow-hidden">
                  <CardContent className="pt-3 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <AvatarCircle login={c.author.login} avatarUrl={c.author.avatarUrl} name={c.author.name} />
                      <span className="text-xs font-medium truncate">{c.author.name || c.author.login}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(c.createdAt)}</span>
                      {c.reviewState && (
                        <Badge variant="secondary" className={cn('text-[10px] shrink-0', reviewBadgeVariant(c.reviewState))}>
                          {c.reviewState.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>
                    {c.path && (
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {c.path}{c.line ? `:${c.line}` : ''}
                      </div>
                    )}
                    {c.diffHunk && (
                      <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-32 min-w-0">
                        {c.diffHunk}
                      </pre>
                    )}
                    <p className="text-xs whitespace-pre-wrap break-words min-w-0">{c.body}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 w-full text-xs"
                      onClick={() => handleAddressWithAI(c.body, c.path, c.line)}
                    >
                      <BotMessageSquare className="size-3.5" />
                      Autofix
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
