import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitCommit, GitPullRequest } from 'lucide-react';

interface ReviewToolboxProps {
  worktreeId: string;
  branches: string[];
}

export function ReviewToolbox({ worktreeId, branches }: ReviewToolboxProps) {
  const [baseBranch, setBaseBranch] = useState('staging');
  const [commitSent, setCommitSent] = useState(false);
  const [pushSent, setPushSent] = useState(false);

  const send = async (command: string, setSent: (v: boolean) => void) => {
    setSent(true);
    try {
      await api.sendTerminalCommand(worktreeId, command);
    } catch (err) {
      console.error('Failed to send terminal command:', err);
    } finally {
      setTimeout(() => setSent(false), 2000);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-card/90 backdrop-blur-sm shadow-lg">
      <Button
        size="sm"
        variant="outline"
        className="rounded-full gap-1.5 h-8"
        disabled={commitSent}
        onClick={() => send('/commit-commands:commit\r', setCommitSent)}
      >
        <GitCommit className="size-3.5" />
        {commitSent ? 'Sent!' : 'Commit'}
      </Button>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">to</span>
        <Select value={baseBranch} onValueChange={setBaseBranch}>
          <SelectTrigger className="h-7 text-xs rounded-full min-w-[100px]">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="rounded-full gap-1.5 h-8"
        disabled={pushSent}
        onClick={() => send(`/commit-commands:commit-push-pr ${baseBranch}\r`, setPushSent)}
      >
        <GitPullRequest className="size-3.5" />
        {pushSent ? 'Sent!' : 'Push PR'}
      </Button>
    </div>
  );
}
