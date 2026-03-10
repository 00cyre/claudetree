import type { Project, Worktree, LinearStatus, AIStatus, SessionStatus, ClaudeActivityState } from '@/types';
import { extractTicketIdFromBranch } from '@/utils/linear';
import { X, Link2, Folder, CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import { GitBranchIcon } from '@/components/ui/git-branch';
import { PlusIcon } from '@/components/ui/plus';
import { BotIcon } from '@/components/ui/bot';
import { Spinner } from '@/components/ui/spinner';
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

function StatusDot({ state }: { state: ClaudeActivityState }) {
  return (
    <span className={cn('size-2 rounded-full shrink-0', STATUS_DOT_STYLES[state])} />
  );
}

const STATUS_LABEL: Record<ClaudeActivityState, { label: string; className: string }> = {
  booting: { label: 'Starting...', className: 'text-muted-foreground' },
  active: { label: 'Working', className: 'text-amber-600 dark:text-amber-400' },
  idle: { label: 'Ready for review', className: 'text-emerald-600 dark:text-emerald-400' },
  exited: { label: 'Session ended', className: 'text-muted-foreground' },
  error: { label: 'Error', className: 'text-red-600 dark:text-red-400' },
};

function ActivityLine({ status }: { status: SessionStatus }) {
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

function WorktreeItem({
  wt,
  isActive,
  status,
  onSelect,
  onDelete,
}: {
  wt: Worktree;
  isActive: boolean;
  status?: SessionStatus;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const ticketId = wt.linearIssueId ?? extractTicketIdFromBranch(wt.name);
  const description = status?.description ?? wt.description;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={wt.name}
        onClick={onSelect}
        className="h-auto py-1.5"
      >
        <div className="flex items-start gap-1.5 min-w-0 w-full">
          {status && <StatusDot state={status.state} />}
          <GitBranchIcon size={16} className="shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <span className="truncate text-sm leading-tight">{wt.name}</span>
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
            {status && (
              <div className="text-[10px] leading-tight">
                <ActivityLine status={status} />
              </div>
            )}
          </div>
        </div>
      </SidebarMenuButton>
      <SidebarMenuAction
        showOnHover
        className="text-muted-foreground hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Remove worktree"
      >
        <X className="size-3" />
      </SidebarMenuAction>
    </SidebarMenuItem>
  );
}

export interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (p: Project) => void;
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  onSelectWorktree: (w: Worktree) => void;
  onNewWorktree: () => void;
  onDeleteWorktree: (id: string) => void;
  onAddProject?: () => void;
  loading: boolean;
  linearStatus: LinearStatus;
  onLinearSetup: () => void;
  aiStatus: AIStatus;
  onAISetup: () => void;
  statuses: Map<string, SessionStatus>;
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
  onAddProject,
  loading,
  linearStatus,
  onLinearSetup,
  aiStatus,
  onAISetup,
  statuses,
}: SidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <SidebarRoot side="left" collapsible="icon" variant="floating">
      <SidebarHeader>
        {collapsed ? (
          <div className="flex justify-center py-1">
            <Folder className="size-4 text-muted-foreground" />
          </div>
        ) : (
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
                {worktrees.map((wt) => (
                  <WorktreeItem
                    key={wt.id}
                    wt={wt}
                    isActive={selectedWorktree?.id === wt.id}
                    status={statuses.get(wt.id)}
                    onSelect={() => onSelectWorktree(wt)}
                    onDelete={() => onDeleteWorktree(wt.id)}
                  />
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
