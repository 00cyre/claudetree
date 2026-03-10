import type { Project, Worktree, LinearStatus, AIStatus } from '@/types';
import { extractTicketIdFromBranch } from '@/utils/linear';
import { GitBranch, Plus, X, Link2, Bot, Folder } from 'lucide-react';
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
                <Plus className="size-4" />
              </button>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Worktrees</SidebarGroupLabel>
          <SidebarGroupAction title="New worktree" onClick={onNewWorktree}>
            <Plus className="size-4" />
          </SidebarGroupAction>
          <SidebarGroupContent>
            {loading ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">Loading...</div>
            ) : worktrees.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">No worktrees</div>
            ) : (
              <SidebarMenu className="gap-1.5">
                {worktrees.map((wt) => {
                  const ticketId = wt.linearIssueId ?? extractTicketIdFromBranch(wt.name);
                  const isActive = selectedWorktree?.id === wt.id;
                  return (
                    <SidebarMenuItem key={wt.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={wt.name}
                        onClick={() => onSelectWorktree(wt)}
                      >
                        <GitBranch className="size-4 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{wt.name}</span>
                          {ticketId && (
                            <span className="text-[10px] text-muted-foreground truncate" title={ticketId}>
                              {ticketId}
                            </span>
                          )}
                        </div>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDeleteWorktree(wt.id); }}
                        title="Remove worktree"
                      >
                        <X className="size-3" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  );
                })}
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
              <Bot className="size-4 shrink-0" />
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
