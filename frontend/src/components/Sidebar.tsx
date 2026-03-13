import { useState, useRef, useCallback, useEffect } from 'react';
import type { Project, Worktree, Flag, LinearStatus, AIStatus, SessionStatus, ClaudeActivityState, PipelineStatus, PRWatcherStatus, DevStep } from '@/types';
import { extractTicketIdFromBranch } from '@/utils/linear';
import { deriveDevStep, reachableSteps } from '@/hooks/useDevStepper';
import { Stepper, useStepperCtx, stepDefs } from '@/lib/stepper';
import { X, Link2, Folder, CheckCircle2, AlertCircle, Circle, GripVertical, Tag, Plus, GitPullRequest, Terminal, GitMerge, Check, FileSearch } from 'lucide-react';
import { GitBranchIcon } from '@/components/ui/git-branch';
import { PlusIcon } from '@/components/ui/plus';
import { BotIcon } from '@/components/ui/bot';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover } from 'radix-ui';
import { cn } from '@/lib/utils';

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

const STATUS_DOT_STYLES: Record<ClaudeActivityState, string> = {
  booting: 'bg-gray-400 animate-pulse',
  active: 'bg-amber-400 animate-pulse',
  idle: 'bg-emerald-400',
  exited: 'bg-gray-400',
  error: 'bg-red-400',
};

const STATUS_LABEL: Record<ClaudeActivityState, { label: string; className: string }> = {
  booting: { label: 'Starting...', className: 'text-muted-foreground' },
  active: { label: 'Working', className: 'text-amber-600 dark:text-amber-400' },
  idle: { label: 'Ready for review', className: 'text-emerald-600 dark:text-emerald-400' },
  exited: { label: 'Session ended', className: 'text-muted-foreground' },
  error: { label: 'Error', className: 'text-red-600 dark:text-red-400' },
};

const PIPELINE_LABEL: Record<string, { label: string; className: string }> = {
  watching: { label: 'Watching CI...', className: 'text-amber-600 dark:text-amber-400' },
  passing: { label: 'CI passed', className: 'text-emerald-600 dark:text-emerald-400' },
  failing: { label: 'CI failed', className: 'text-red-600 dark:text-red-400' },
  fixing: { label: 'Auto-fixing...', className: 'text-amber-600 dark:text-amber-400' },
  error: { label: 'Pipeline error', className: 'text-red-600 dark:text-red-400' },
};

function pipelineDotStyle(phase: string): string {
  switch (phase) {
    case 'watching':
    case 'fixing':
      return 'bg-amber-400 animate-pulse';
    case 'passing':
      return 'bg-emerald-400';
    case 'failing':
    case 'error':
      return 'bg-red-400';
    default:
      return '';
  }
}

const PR_WATCHER_LABEL: Record<string, { label: string; className: string }> = {
  discovering: { label: 'Discovering PR...', className: 'text-muted-foreground' },
  watching: { label: 'Watching PR', className: 'text-blue-600 dark:text-blue-400' },
  ci_failing: { label: 'PR CI failed', className: 'text-red-600 dark:text-red-400' },
  fixing: { label: 'Auto-fixing CI...', className: 'text-amber-600 dark:text-amber-400' },
  pushing_fix: { label: 'Pushing fix...', className: 'text-amber-600 dark:text-amber-400' },
  no_pr: { label: 'No PR found', className: 'text-muted-foreground' },
  error: { label: 'PR watcher error', className: 'text-red-600 dark:text-red-400' },
};

function prWatcherDotStyle(phase: string): string {
  switch (phase) {
    case 'discovering':
    case 'fixing':
    case 'pushing_fix':
      return 'bg-amber-400 animate-pulse';
    case 'watching':
      return 'bg-blue-400';
    case 'ci_failing':
    case 'error':
      return 'bg-red-400';
    case 'no_pr':
      return 'bg-gray-400';
    default:
      return '';
  }
}

const SIDEBAR_STEP_ICONS: Record<string, React.ReactNode> = {
  dev: <Terminal className="size-3" />,
  review: <FileSearch className="size-3" />,
  pr: <GitPullRequest className="size-3" />,
  merged: <GitMerge className="size-3" />,
};

function StepSync({ targetStep }: { targetStep: string }) {
  const stepper = useStepperCtx();
  const stepperRef = useRef(stepper);
  stepperRef.current = stepper;
  const prevRef = useRef(targetStep);

  useEffect(() => {
    if (prevRef.current !== targetStep) {
      prevRef.current = targetStep;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stepperRef.current.navigation.goTo(targetStep as any);
    }
  }, [targetStep]);

  return null;
}

type StepUrgency = 'action-needed' | 'attention' | 'ready' | 'working' | 'normal';

function computePRUrgency(prWatcherStatus?: PRWatcherStatus): StepUrgency {
  if (!prWatcherStatus || prWatcherStatus.phase === 'stopped' || prWatcherStatus.phase === 'no_pr') return 'normal';

  // CI failing or changes requested → action needed (red)
  if (prWatcherStatus.ciStatus === 'failing' || prWatcherStatus.reviewDecision === 'CHANGES_REQUESTED') {
    return 'action-needed';
  }

  // CI passing + approved → ready to merge (green)
  if (prWatcherStatus.ciStatus === 'passing' && prWatcherStatus.reviewDecision === 'APPROVED') {
    return 'ready';
  }

  // Undismissed comments/reviews → attention (amber)
  const hasUndismissed = prWatcherStatus.notifications.some(
    n => !n.dismissed && (n.type === 'new_comment' || n.type === 'new_review'),
  );
  if (hasUndismissed) return 'attention';

  // CI pending or fixing → working
  if (prWatcherStatus.ciStatus === 'pending' || prWatcherStatus.phase === 'fixing' || prWatcherStatus.phase === 'pushing_fix') {
    return 'working';
  }

  return 'normal';
}

function computeDevUrgency(sessionStatus?: SessionStatus): StepUrgency {
  if (!sessionStatus) return 'normal';
  if (sessionStatus.state === 'active' || sessionStatus.state === 'booting') return 'working';
  if (sessionStatus.state === 'idle') return 'ready';
  return 'normal';
}

const URGENCY_INDICATOR: Record<StepUrgency, string> = {
  'action-needed': 'bg-red-500 text-white shadow-[0_0_6px_rgba(239,68,68,0.4)]',
  attention: 'bg-amber-500 text-white shadow-[0_0_6px_rgba(245,158,11,0.4)]',
  ready: 'bg-emerald-500 text-white',
  working: 'bg-amber-500 text-white animate-pulse',
  normal: '',
};

const URGENCY_TITLE: Record<StepUrgency, string> = {
  'action-needed': 'text-red-500',
  attention: 'text-amber-500',
  ready: 'text-emerald-500',
  working: 'text-amber-500',
  normal: '',
};

function SidebarStepper({
  currentStep,
  onStepClick,
  prWatcherStatus,
  sessionStatus,
}: {
  currentStep: DevStep;
  onStepClick?: (step: DevStep) => void;
  prWatcherStatus?: PRWatcherStatus;
  sessionStatus?: SessionStatus;
}) {
  const reachable = reachableSteps(prWatcherStatus);
  const isMerged = currentStep === 'merged';

  const prUrgency = computePRUrgency(prWatcherStatus);
  const devUrgency = computeDevUrgency(sessionStatus);

  // Per-step urgency map
  const stepUrgency: Record<string, StepUrgency> = {
    dev: devUrgency,
    review: 'normal',
    pr: prUrgency,
    merged: 'normal',
  };

  const currentStepIdx = stepDefs.findIndex(s => s.id === currentStep);

  return (
    <Stepper.Root orientation="horizontal" initialStep={currentStep as 'dev' | 'pr' | 'merged'}>
      <StepSync targetStep={currentStep} />
      <Stepper.List className="flex items-start gap-0 px-1">
        {stepDefs.map((step, i) => {
          const stepId = step.id as DevStep;
          const canNavigate = onStepClick && reachable.has(stepId) && !isMerged;
          const isSepActive = i < stepDefs.length - 1 && currentStepIdx === i;
          const urgency = stepUrgency[stepId] ?? 'normal';
          const hasUrgencyOverride = urgency !== 'normal';

          return (
            <Stepper.Item
              key={step.id}
              step={step.id}
              className="group/step flex items-start flex-1 last:flex-initial"
            >
              <Stepper.Trigger
                className={cn(
                  'flex flex-col items-center gap-0.5 transition-opacity',
                  canNavigate && 'cursor-pointer hover:opacity-80',
                  !canNavigate && 'cursor-default',
                )}
                onClick={() => canNavigate && onStepClick?.(stepId)}
              >
                <Stepper.Indicator
                  className={cn(
                    'group/ind size-6 rounded-full flex items-center justify-center transition-all',
                    hasUrgencyOverride
                      ? URGENCY_INDICATOR[urgency]
                      : [
                          'data-[status=active]:bg-blue-500 data-[status=active]:text-white data-[status=active]:shadow-[0_0_6px_rgba(59,130,246,0.4)]',
                          'data-[status=success]:bg-emerald-500 data-[status=success]:text-white',
                          'data-[status=inactive]:border data-[status=inactive]:border-muted-foreground/30 data-[status=inactive]:text-muted-foreground',
                        ],
                    urgency === 'ready' && stepId === 'pr' && 'stepper-sonar',
                  )}
                >
                  <span className={cn(hasUrgencyOverride ? '' : 'group-data-[status=success]/ind:hidden')}>
                    {SIDEBAR_STEP_ICONS[step.id]}
                  </span>
                  {!hasUrgencyOverride && (
                    <Check className="size-2.5 hidden group-data-[status=success]/ind:block" strokeWidth={3} />
                  )}
                </Stepper.Indicator>
                <Stepper.Title
                  className={cn(
                    'text-[9px] font-medium text-center leading-tight',
                    hasUrgencyOverride
                      ? URGENCY_TITLE[urgency]
                      : 'data-[status=active]:text-blue-500 data-[status=success]:text-emerald-500 data-[status=inactive]:text-muted-foreground',
                  )}
                >
                  {step.title}
                </Stepper.Title>
              </Stepper.Trigger>
              {i < stepDefs.length - 1 && (
                <Stepper.Separator
                  className={cn(
                    'h-0.5 flex-1 mx-1 mt-3 rounded-full',
                    'data-[status=success]:bg-emerald-500',
                    'data-[status=inactive]:bg-muted-foreground/20',
                    isSepActive ? 'stepper-radar' : 'data-[status=active]:bg-muted-foreground/20',
                  )}
                />
              )}
            </Stepper.Item>
          );
        })}
      </Stepper.List>
    </Stepper.Root>
  );
}

function ActivityLine({ status, pipelineStatus, prWatcherStatus }: { status: SessionStatus; pipelineStatus?: PipelineStatus; prWatcherStatus?: PRWatcherStatus }) {
  // PRWatcher takes priority when active
  if (prWatcherStatus && prWatcherStatus.phase !== 'stopped') {
    const elapsed = formatElapsed(Date.now() - prWatcherStatus.since);
    const info = PR_WATCHER_LABEL[prWatcherStatus.phase] ?? { label: prWatcherStatus.phase, className: 'text-muted-foreground' };

    const prLabel = prWatcherStatus.prNumber
      ? `${info.label} #${prWatcherStatus.prNumber}`
      : info.label;

    // Show new comment count if watching
    const undismissed = prWatcherStatus.notifications.filter((n) => !n.dismissed);
    const newComments = undismissed.filter((n) => n.type === 'new_comment' || n.type === 'new_review').length;

    const icon = (() => {
      switch (prWatcherStatus.phase) {
        case 'discovering':
        case 'fixing':
        case 'pushing_fix':
          return <Spinner className="size-3" />;
        case 'watching':
          return <GitPullRequest className="size-3 shrink-0" />;
        case 'ci_failing':
        case 'error':
          return <AlertCircle className="size-3 shrink-0" />;
        default:
          return <Circle className="size-3 shrink-0" />;
      }
    })();

    return (
      <span className={cn('flex items-center gap-1', info.className)}>
        {icon}
        <span className="truncate">{prLabel}</span>
        {newComments > 0 && (
          <span className="shrink-0 text-blue-500 font-medium">{newComments} new</span>
        )}
        <span className="shrink-0 text-muted-foreground">({elapsed})</span>
      </span>
    );
  }

  if (pipelineStatus && pipelineStatus.phase !== 'idle') {
    const elapsed = formatElapsed(Date.now() - pipelineStatus.since);
    const info = PIPELINE_LABEL[pipelineStatus.phase] ?? { label: pipelineStatus.phase, className: 'text-muted-foreground' };

    const icon = (() => {
      switch (pipelineStatus.phase) {
        case 'watching':
        case 'fixing':
          return <Spinner className="size-3" />;
        case 'passing':
          return <CheckCircle2 className="size-3 shrink-0" />;
        case 'failing':
        case 'error':
          return <AlertCircle className="size-3 shrink-0" />;
        default:
          return <Circle className="size-3 shrink-0" />;
      }
    })();

    return (
      <span className={cn('flex items-center gap-1', info.className)}>
        {icon}
        <span className="truncate">{info.label}</span>
        <span className="shrink-0 text-muted-foreground">({elapsed})</span>
      </span>
    );
  }

  const elapsed = formatElapsed(Date.now() - status.stateStartedAt);
  const { label, className } = STATUS_LABEL[status.state];

  const icon = (() => {
    switch (status.state) {
      case 'booting':
      case 'active':
        return <Spinner className="size-3" />;
      case 'idle':
        return <CheckCircle2 className="size-3 shrink-0" />;
      case 'error':
        return <AlertCircle className="size-3 shrink-0" />;
      case 'exited':
        return <Circle className="size-3 shrink-0" />;
    }
  })();

  return (
    <span className={cn('flex items-center gap-1', className)}>
      {icon}
      <span className="truncate">{label}</span>
      {status.state !== 'exited' && (
        <span className="shrink-0 text-muted-foreground">({elapsed})</span>
      )}
    </span>
  );
}

// --- Flag Picker Popover ---

const FLAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

function FlagPicker({
  worktreeFlags,
  allFlags,
  onToggleFlag,
  onCreateFlag,
}: {
  worktreeFlags: string[];
  allFlags: Flag[];
  onToggleFlag: (name: string) => void;
  onCreateFlag: (name: string, color: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(FLAG_COLORS[0]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateFlag(trimmed, newColor);
    onToggleFlag(trimmed);
    setNewName('');
  };

  return (
    <div className="w-48 p-2 space-y-2">
      {allFlags.length > 0 && (
        <div className="space-y-1">
          {allFlags.map((f) => (
            <button
              key={f.name}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-muted transition-colors text-left',
                worktreeFlags.includes(f.name) && 'bg-muted',
              )}
              onClick={() => onToggleFlag(f.name)}
            >
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
              <span className="truncate">{f.name}</span>
              {worktreeFlags.includes(f.name) && (
                <CheckCircle2 className="size-3 ml-auto shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
      <div className="border-t border-border pt-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Input
            className="h-6 text-xs flex-1"
            placeholder="New flag..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
          <button
            className="size-6 shrink-0 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
            onClick={handleCreate}
            title="Add flag"
          >
            <Plus className="size-3" />
          </button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {FLAG_COLORS.map((c) => (
            <button
              key={c}
              className={cn(
                'size-4 rounded-full border-2 transition-colors',
                newColor === c ? 'border-foreground' : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
              onClick={() => setNewColor(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Worktree Item ---

function WorktreeItem({
  wt,
  isActive,
  status,
  pipelineStatus,
  prWatcherStatus,
  allFlags,
  currentStep,
  onStepClick,
  onSelect,
  onDelete,
  onSetFlags,
  onCreateFlag,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  wt: Worktree;
  isActive: boolean;
  status?: SessionStatus;
  pipelineStatus?: PipelineStatus;
  prWatcherStatus?: PRWatcherStatus;
  allFlags: Flag[];
  currentStep?: DevStep;
  onStepClick?: (step: DevStep) => void;
  onSelect: () => void;
  onDelete: () => void;
  onSetFlags: (flags: string[]) => void;
  onCreateFlag: (name: string, color: string) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const ticketId = wt.linearIssueId ?? extractTicketIdFromBranch(wt.name);
  const description = status?.description ?? wt.description;
  const wtFlags = wt.flags ?? [];
  const flagDefs = allFlags.filter((f) => wtFlags.includes(f.name));
  const derivedStep = deriveDevStep(prWatcherStatus);

  const toggleFlag = (name: string) => {
    const next = wtFlags.includes(name)
      ? wtFlags.filter((f) => f !== name)
      : [...wtFlags, name];
    onSetFlags(next);
  };

  return (
    <SidebarMenuItem
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <SidebarMenuButton
        isActive={isActive}
        tooltip={wt.name}
        onClick={onSelect}
        className="h-auto py-1.5 items-start"
      >
        <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
          <GitBranchIcon size={16} />
          <GripVertical className="size-3 text-muted-foreground/50 cursor-grab" />
        </div>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {status && (
              <span className={cn(
                'size-2 rounded-full shrink-0',
                prWatcherStatus && prWatcherStatus.phase !== 'stopped'
                  ? prWatcherDotStyle(prWatcherStatus.phase)
                  : pipelineStatus && pipelineStatus.phase !== 'idle'
                    ? pipelineDotStyle(pipelineStatus.phase)
                    : STATUS_DOT_STYLES[status.state],
              )} />
            )}
            <span className="truncate text-sm leading-tight">{wt.name}</span>
          </div>
          {ticketId && (
            <span className="text-[10px] text-muted-foreground truncate leading-tight" title={ticketId}>
              {ticketId}
            </span>
          )}
          {description && (
            <span className="text-[10px] text-muted-foreground/80 truncate leading-tight italic" title={description}>
              {description}
            </span>
          )}
          {flagDefs.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-0.5">
              {flagDefs.map((f) => (
                <Badge key={f.name} variant="outline" className="h-4 text-[9px] px-1.5 gap-1">
                  <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  {f.name}
                </Badge>
              ))}
            </div>
          )}
          {status && (
            <div className="text-[10px] leading-tight">
              <ActivityLine status={status} pipelineStatus={pipelineStatus} prWatcherStatus={prWatcherStatus} />
            </div>
          )}
          <div className="mt-1" onClick={(e) => e.stopPropagation()}>
            <SidebarStepper
              currentStep={currentStep ?? derivedStep}
              onStepClick={isActive ? onStepClick : undefined}
              prWatcherStatus={prWatcherStatus}
              sessionStatus={status}
            />
          </div>
        </div>
      </SidebarMenuButton>
      <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 group-hover/menu-item:opacity-100 transition-opacity">
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              className="size-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={(e) => e.stopPropagation()}
              title="Set flags"
            >
              <Tag className="size-3" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="right"
              align="start"
              sideOffset={4}
              className="z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <FlagPicker
                worktreeFlags={wtFlags}
                allFlags={allFlags}
                onToggleFlag={toggleFlag}
                onCreateFlag={onCreateFlag}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button
          className="size-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Remove worktree"
        >
          <X className="size-3" />
        </button>
      </div>
    </SidebarMenuItem>
  );
}

// --- Main Sidebar ---

export interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (p: Project) => void;
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  onSelectWorktree: (w: Worktree) => void;
  onNewWorktree: () => void;
  onDeleteWorktree: (id: string) => void;
  onReorderWorktrees: (worktrees: Worktree[]) => void;
  onSetWorktreeFlags: (worktreeId: string, flags: string[]) => void;
  onAddProject?: () => void;
  loading: boolean;
  linearStatus: LinearStatus;
  onLinearSetup: () => void;
  aiStatus: AIStatus;
  onAISetup: () => void;
  statuses: Map<string, SessionStatus>;
  pipelineStatuses: Map<string, PipelineStatus>;
  prWatcherStatuses: Map<string, PRWatcherStatus>;
  baseBranch: string;
  onBaseBranchChange: (branch: string) => void;
  branches: string[];
  flags: Flag[];
  onCreateFlag: (name: string, color: string) => void;
  currentStep?: DevStep;
  onStepChange?: (step: DevStep) => void;
  stepOverrides?: Map<string, DevStep>;
}

export function AppSidebar({
  projects,
  selectedProject,
  onSelectProject,
  worktrees,
  selectedWorktree,
  onSelectWorktree,
  onNewWorktree,
  onDeleteWorktree,
  onReorderWorktrees,
  onSetWorktreeFlags,
  onAddProject,
  loading,
  linearStatus,
  onLinearSetup,
  aiStatus,
  onAISetup,
  statuses,
  pipelineStatuses,
  prWatcherStatuses,
  baseBranch,
  onBaseBranchChange,
  branches,
  flags,
  onCreateFlag,
  currentStep,
  onStepChange,
  stepOverrides,
}: SidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = useCallback((idx: number) => (e: React.DragEvent) => {
    dragItem.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverItem.current = idx;
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return;
    const reordered = [...worktrees];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, moved);
    onReorderWorktrees(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverIdx(null);
  }, [worktrees, onReorderWorktrees]);

  const handleDragEnd = useCallback(() => {
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverIdx(null);
  }, []);

  return (
    <SidebarRoot side="left" collapsible="icon" variant="floating">
      <SidebarHeader>
        {collapsed ? (
          <div className="flex justify-center py-1">
            <Folder className="size-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Select
                value={selectedProject?.id ?? ''}
                onValueChange={(v) => {
                  const p = projects.find((p) => p.id === v);
                  if (p) onSelectProject(p);
                }}
              >
                <SelectTrigger className="flex-1 h-8">
                  <SelectValue placeholder="No projects" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Select value={baseBranch} onValueChange={onBaseBranchChange}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {[baseBranch, ...branches.filter((b) => b !== baseBranch)].map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {onAddProject && (
                <button
                  onClick={onAddProject}
                  className="size-8 shrink-0 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Add project"
                >
                  <PlusIcon size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Worktrees</SidebarGroupLabel>
          <SidebarGroupAction title="New worktree" onClick={onNewWorktree}>
            <PlusIcon size={16} />
          </SidebarGroupAction>
          <SidebarGroupContent>
            {loading ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">Loading...</div>
            ) : worktrees.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">No worktrees</div>
            ) : (
              <SidebarMenu className="gap-1.5">
                {worktrees.map((wt, idx) => (
                  <div
                    key={wt.id}
                    className={cn(
                      'transition-all',
                      dragOverIdx === idx && dragItem.current !== idx && 'border-t-2 border-primary',
                    )}
                  >
                    <WorktreeItem
                      wt={wt}
                      isActive={selectedWorktree?.id === wt.id}
                      status={statuses.get(wt.id)}
                      pipelineStatus={pipelineStatuses.get(wt.id)}
                      prWatcherStatus={prWatcherStatuses.get(wt.id)}
                      allFlags={flags}
                      currentStep={selectedWorktree?.id === wt.id ? currentStep : stepOverrides?.get(wt.id)}
                      onStepClick={selectedWorktree?.id === wt.id ? onStepChange : undefined}
                      onSelect={() => onSelectWorktree(wt)}
                      onDelete={() => onDeleteWorktree(wt.id)}
                      onSetFlags={(f) => onSetWorktreeFlags(wt.id, f)}
                      onCreateFlag={onCreateFlag}
                      onDragStart={handleDragStart(idx)}
                      onDragOver={handleDragOver(idx)}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                    />
                  </div>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Linear"
              onClick={onLinearSetup}
              className={cn(
                linearStatus.connected && 'text-green-600 dark:text-green-400'
              )}
            >
              <Link2 className="size-4 shrink-0" />
              <span>{linearStatus.connected ? 'Linear connected' : 'Connect Linear'}</span>
              {linearStatus.connected && (
                <span className="ml-auto size-2 rounded-full bg-green-500 shrink-0" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="AI"
              onClick={onAISetup}
              className={cn(
                aiStatus.connected && 'text-green-600 dark:text-green-400'
              )}
            >
              <BotIcon size={16} className="shrink-0" />
              <span>{aiStatus.connected ? 'AI connected' : 'Connect AI'}</span>
              {aiStatus.connected && (
                <span className="ml-auto size-2 rounded-full bg-green-500 shrink-0" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  );
}
