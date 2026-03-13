import { useState, useMemo } from 'react';
import { TerminalView } from '@/components/Terminal';
import type { SessionStatus } from '@/types';
import { cn } from '@/lib/utils';
import { Terminal, Wrench, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface TabbedTerminalProps {
  worktreeId: string | null;
  sessionStatuses: Map<string, SessionStatus>;
  onExit?: () => void;
}

interface TabInfo {
  sessionId: string;
  label: string;
  isAutofix: boolean;
  status?: SessionStatus;
}

export function TabbedTerminalView({ worktreeId, sessionStatuses, onExit }: TabbedTerminalProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const tabs = useMemo<TabInfo[]>(() => {
    if (!worktreeId) return [];

    const result: TabInfo[] = [
      {
        sessionId: worktreeId,
        label: 'Main',
        isAutofix: false,
        status: sessionStatuses.get(worktreeId),
      },
    ];

    for (const [key, status] of sessionStatuses) {
      if (key.startsWith(`${worktreeId}::autofix-`)) {
        const tabName = key.split('::')[1];
        const attempt = tabName.replace('autofix-', '');
        result.push({
          sessionId: key,
          label: `Fix #${attempt}`,
          isAutofix: true,
          status,
        });
      }
    }

    return result;
  }, [worktreeId, sessionStatuses]);

  // Default to main tab, or switch to latest autofix if one appears
  const effectiveTab = activeTab && tabs.some(t => t.sessionId === activeTab)
    ? activeTab
    : tabs[0]?.sessionId ?? null;

  const hasAutofixTabs = tabs.some(t => t.isAutofix);

  if (!worktreeId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a worktree to open a terminal
      </div>
    );
  }

  // No autofix tabs — render plain terminal without tab bar
  if (!hasAutofixTabs) {
    return <TerminalView worktreeId={worktreeId} onExit={onExit} />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0 border-b border-border bg-muted/30 px-1 shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.sessionId === effectiveTab;
          const isWorking = tab.status?.state === 'active' || tab.status?.state === 'booting';

          return (
            <button
              key={tab.sessionId}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              onClick={() => setActiveTab(tab.sessionId)}
            >
              {tab.isAutofix ? (
                isWorking ? <Spinner className="size-3" /> : <Wrench className="size-3" />
              ) : (
                <Terminal className="size-3" />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.sessionId}
            className={cn(
              'h-full',
              tab.sessionId === effectiveTab ? 'block' : 'hidden',
            )}
          >
            <TerminalView
              worktreeId={tab.sessionId}
              onExit={tab.isAutofix ? undefined : onExit}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
