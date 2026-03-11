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
    <div className="flex flex-col h-full p-3 overflow-hidden">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Toolbox</h4>
      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          disabled={commitSent}
          onClick={() => send('/commit-commands:commit\r', setCommitSent)}
        >
          <GitCommit className="size-3.5" />
          {commitSent ? 'Sent!' : 'Commit'}
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">pointing to:</span>
          <Select value={baseBranch} onValueChange={setBaseBranch}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={pushSent}
            onClick={() => send(`/commit-commands:commit-push-pr ${baseBranch}\r`, setPushSent)}
          >
            <GitPullRequest className="size-3.5" />
            {pushSent ? 'Sent!' : 'Push PR'}
          </Button>
        </div>
      </div>
    </div>
  );
}
