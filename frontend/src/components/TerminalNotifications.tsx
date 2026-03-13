import { useEffect, useRef } from 'react';
import type { PRNotification } from '@/types';
import { X, AlertCircle, CheckCircle2, MessageSquare, GitPullRequest, Wrench } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface TerminalNotificationsProps {
  notifications: PRNotification[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS: Partial<Record<string, number>> = {
  ci_passed: 8000,
  autofix_pushed: 8000,
  new_comment: 15000,
  new_review: 15000,
  pr_closed: 8000,
  pr_merged: 8000,
};

const MAX_VISIBLE = 4;

function notifIcon(type: string) {
  switch (type) {
    case 'ci_failed':
    case 'autofix_failed':
      return <AlertCircle className="size-3.5 shrink-0 text-red-400" />;
    case 'ci_passed':
    case 'autofix_pushed':
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />;
    case 'autofix_started':
      return <Spinner className="size-3.5 shrink-0" />;
    case 'new_comment':
    case 'new_review':
      return <MessageSquare className="size-3.5 shrink-0 text-blue-400" />;
    case 'pr_closed':
    case 'pr_merged':
      return <GitPullRequest className="size-3.5 shrink-0 text-purple-400" />;
    default:
      return <Wrench className="size-3.5 shrink-0 text-amber-400" />;
  }
}

function notifBorderColor(type: string): string {
  switch (type) {
    case 'ci_failed':
    case 'autofix_failed':
      return 'border-l-red-500';
    case 'ci_passed':
    case 'autofix_pushed':
      return 'border-l-emerald-500';
    case 'autofix_started':
      return 'border-l-amber-500';
    case 'new_comment':
    case 'new_review':
      return 'border-l-blue-500';
    default:
      return 'border-l-muted-foreground';
  }
}

export function TerminalNotifications({ notifications, onDismiss }: TerminalNotificationsProps) {
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const visible = notifications
    .filter((n) => !n.dismissed)
    .slice(-MAX_VISIBLE);

  const totalUndismissed = notifications.filter((n) => !n.dismissed).length;
  const overflow = totalUndismissed - MAX_VISIBLE;

  useEffect(() => {
    const timers = timersRef.current;
    for (const notif of visible) {
      if (timers.has(notif.id)) continue;
      const ms = AUTO_DISMISS_MS[notif.type];
      if (ms) {
        const timer = setTimeout(() => {
          onDismiss(notif.id);
          timers.delete(notif.id);
        }, ms);
        timers.set(notif.id, timer);
      }
    }
    return () => {
      // Don't clear on unmount — let them fire
    };
  }, [visible, onDismiss]);

  if (visible.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col-reverse gap-2 max-w-sm pointer-events-none">
      {visible.map((notif) => (
        <div
          key={notif.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-md border border-l-2 bg-card/95 backdrop-blur-sm shadow-lg',
            'animate-in slide-in-from-left duration-200',
            notifBorderColor(notif.type),
          )}
        >
          {notifIcon(notif.type)}
          <span className="text-xs text-foreground leading-tight flex-1 min-w-0">
            {notif.message}
          </span>
          <button
            className="size-4 shrink-0 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={() => onDismiss(notif.id)}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {overflow > 0 && (
        <div className="pointer-events-auto text-[10px] text-muted-foreground px-3">
          +{overflow} more
        </div>
      )}
    </div>
  );
}
