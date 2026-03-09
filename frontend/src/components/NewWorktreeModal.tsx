import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NewWorktreeModalProps {
  onClose: () => void;
  onCreate: (name: string, linearIssueId?: string) => Promise<void>;
  onAddProject: (path: string) => Promise<void>;
  hasProject: boolean;
  linearConnected: boolean;
}

function extractIssueId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/issue\/([\w]+-\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[\w]+-\d+$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function NewWorktreeModal({ onClose, onCreate, onAddProject, hasProject, linearConnected }: NewWorktreeModalProps) {
  const [name, setName] = useState('');
  const [linearIssueId, setLinearIssueId] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const issueId = linearIssueId.trim() ? extractIssueId(linearIssueId) : undefined;
      await onCreate(name.trim(), issueId);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddProject = async () => {
    if (!projectPath.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onAddProject(projectPath.trim());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>New Worktree</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!hasProject && (
            <div className="space-y-2">
              <Label>Project path (git repository)</Label>
              <div className="flex gap-2">
                <Input
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/repo"
                  className="flex-1"
                />
                <Button onClick={handleAddProject} disabled={loading} variant="secondary">
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Feature name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-feature"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          {linearConnected && (
            <div className="space-y-2">
              <Label>Linear issue (optional)</Label>
              <Input
                value={linearIssueId}
                onChange={(e) => setLinearIssueId(e.target.value)}
                placeholder="PROJ-123 or paste Linear URL"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={loading || !name.trim() || !hasProject}
          >
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
