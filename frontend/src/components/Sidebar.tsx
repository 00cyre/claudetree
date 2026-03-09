import type { Project, Worktree, LinearStatus, AIStatus } from '@/types';
import { extractTicketIdFromBranch } from '@/utils/linear';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface SidebarProps {
  projects: Project[];
  selectedProject: Project | null;
  onSelectProject: (p: Project) => void;
  worktrees: Worktree[];
  selectedWorktree: Worktree | null;
  onSelectWorktree: (w: Worktree) => void;
  onNewWorktree: () => void;
  onDeleteWorktree: (id: string) => void;
  loading: boolean;
  linearStatus: LinearStatus;
  onLinearSetup: () => void;
  aiStatus: AIStatus;
  onAISetup: () => void;
}

export function Sidebar({
  projects,
  selectedProject,
  onSelectProject,
  worktrees,
  selectedWorktree,
  onSelectWorktree,
  onNewWorktree,
  onDeleteWorktree,
  loading,
  linearStatus,
  onLinearSetup,
  aiStatus,
  onAISetup,
}: SidebarProps) {
  return (
    <aside className="w-60 min-w-60 flex flex-col bg-card border-r border-border p-3 gap-4 overflow-hidden">
      <div className="flex flex-col gap-2 shrink-0">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Project
        </label>
        <Select
          value={selectedProject?.id ?? ''}
          onValueChange={(v) => {
            const p = projects.find((p) => p.id === v);
            if (p) onSelectProject(p);
          }}
        >
          <SelectTrigger className="w-full h-8">
            <SelectValue placeholder="No projects" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 flex-1 min-h-0">
        <div className="flex justify-between items-center">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Worktrees
          </label>
          <Button size="sm" variant="secondary" onClick={onNewWorktree}>
            + New
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-2">Loading...</div>
        ) : worktrees.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">No worktrees</div>
        ) : (
          <ScrollArea className="flex-1 -mx-1">
            <ul className="space-y-0.5">
              {worktrees.map((wt) => {
                const ticketId = wt.linearIssueId ?? extractTicketIdFromBranch(wt.name);
                return (
                  <li
                    key={wt.id}
                    className={cn(
                      'flex items-center justify-between gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm group',
                      selectedWorktree?.id === wt.id
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-muted'
                    )}
                    onClick={() => onSelectWorktree(wt)}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{wt.name}</span>
                      {ticketId && (
                        <span className="text-[10px] text-muted-foreground truncate" title={ticketId}>
                          {ticketId}
                        </span>
                      )}
                    </div>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDeleteWorktree(wt.id); }}
                      title="Remove worktree"
                    >
                      ×
                    </Button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </div>

      <div className="flex flex-col gap-1.5 shrink-0 pt-2 border-t border-border">
        <Button
          size="sm"
          variant={linearStatus.connected ? 'secondary' : 'outline'}
          className={cn(linearStatus.connected && 'border-green-500/50 text-green-600 dark:text-green-400')}
          onClick={onLinearSetup}
        >
          {linearStatus.connected ? 'Linear connected' : 'Connect Linear'}
        </Button>
        <Button
          size="sm"
          variant={aiStatus.connected ? 'secondary' : 'outline'}
          className={cn(aiStatus.connected && 'border-green-500/50 text-green-600 dark:text-green-400')}
          onClick={onAISetup}
        >
          {aiStatus.connected ? 'AI connected' : 'Connect AI'}
        </Button>
      </div>
    </aside>
  );
}
