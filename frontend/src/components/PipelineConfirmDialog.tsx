import type { PipelineStatus } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface PipelineConfirmDialogProps {
  open: boolean;
  status: PipelineStatus;
  onApprove: () => void;
  onReject: () => void;
}

export function PipelineConfirmDialog({
  open,
  status,
  onApprove,
  onReject,
}: PipelineConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onReject(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Push Pipeline Fix?</DialogTitle>
          <DialogDescription>
            Claude has finished fixing the CI failures. Push the changes to re-run the pipeline?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {status.failedChecks && status.failedChecks.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Failed checks:</p>
              <ul className="space-y-1">
                {status.failedChecks.map((check) => (
                  <li key={check} className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="size-3 shrink-0" />
                    {check}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Fix attempt {status.fixAttempt ?? 1} of {status.maxAttempts}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onReject}>
            Cancel
          </Button>
          <Button onClick={onApprove}>
            Push Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
