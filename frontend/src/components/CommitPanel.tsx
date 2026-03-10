import { useState } from 'react';
import type { ChangedFile } from '@/types';
import { api } from '@/api/client';
import { getFileIcon } from '@/utils/fileIcons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface CommitPanelProps {
  worktreeId: string;
  files: ChangedFile[];
  onCommit: () => void;
  linearIssueId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  modified: 'text-yellow-600 dark:text-yellow-400',
  added: 'text-green-600 dark:text-green-400',
  untracked: 'text-green-600 dark:text-green-400',
  deleted: 'text-red-600 dark:text-red-400',
  renamed: 'text-primary',
};

export function CommitPanel({ worktreeId, files, onCommit, linearIssueId }: CommitPanelProps) {
  const [message, setMessage] = useState('');
  const [staged, setStaged] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  const toggleFile = (file: string) => {
    setStaged((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const toggleAll = (checked: boolean | 'indeterminate') => {
    setStaged(checked === true ? new Set(files.map((f) => f.file)) : new Set());
  };

  const handleCommit = async () => {
    if (!message.trim()) return;
    setCommitting(true);
    try {
      await api.commit(worktreeId, message, Array.from(staged));
      setMessage('');
      setStaged(new Set());
      onCommit();
    } catch (err) {
      console.error('Commit failed:', err);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-3 overflow-hidden">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Commit</h4>
      <div className="flex flex-col gap-1 mb-3 flex-1 min-h-0 overflow-auto">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground pb-2 border-b border-border mb-2">
          <Checkbox
            checked={staged.size === files.length && files.length > 0}
            onCheckedChange={toggleAll}
          />
          Select all
        </label>
        {files.map((f) => (
          <label
            key={f.file}
            className="flex items-center gap-2 cursor-pointer text-sm py-0.5"
          >
            <Checkbox
              checked={staged.has(f.file)}
              onCheckedChange={() => toggleFile(f.file)}
            />
            <span className={cn('font-bold w-4 shrink-0', STATUS_COLORS[f.status] ?? '')}>
              {f.status[0].toUpperCase()}
            </span>
            {getFileIcon(f.file)}
            <span className="truncate">{f.file}</span>
          </label>
        ))}
      </div>

      {linearIssueId && (
        <div className="text-xs text-muted-foreground mb-2">
          Commits will be prefixed with <code className="bg-muted px-1 rounded">{linearIssueId}:</code>
        </div>
      )}

      <Textarea
        placeholder="Commit message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        className="mb-2 resize-y"
      />
      <Button
        variant="success"
        className="w-full"
        onClick={handleCommit}
        disabled={committing || !message.trim() || staged.size === 0}
      >
        {committing ? 'Committing...' : 'Commit'}
      </Button>
    </div>
  );
}
