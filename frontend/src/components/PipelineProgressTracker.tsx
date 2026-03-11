import { useState, useEffect } from 'react';
import type { PipelineStatus } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface PipelineProgressTrackerProps {
  status: PipelineStatus;
}

interface Step {
  label: string;
  state: 'done' | 'active' | 'pending' | 'failed';
}

function getSteps(status: PipelineStatus): Step[] {
  const phase = status.phase;

  const steps: Step[] = [
    { label: 'Push to origin', state: 'pending' },
    { label: 'Wait for CI', state: 'pending' },
    { label: 'Run checks', state: 'pending' },
    { label: 'Fix failures', state: 'pending' },
    { label: 'Confirm & push', state: 'pending' },
  ];

  switch (phase) {
    case 'pushing':
      steps[0].state = 'active';
      break;
    case 'waiting':
      steps[0].state = 'done';
      steps[1].state = 'active';
      break;
    case 'passing':
      steps[0].state = 'done';
      steps[1].state = 'done';
      steps[2].state = 'done';
      steps[3].state = 'done';
      steps[4].state = 'done';
      break;
    case 'failing':
      steps[0].state = 'done';
      steps[1].state = 'done';
      steps[2].state = 'failed';
      break;
    case 'fixing':
      steps[0].state = 'done';
      steps[1].state = 'done';
      steps[2].state = 'failed';
      steps[3].state = 'active';
      break;
    case 'confirming':
      steps[0].state = 'done';
      steps[1].state = 'done';
      steps[2].state = 'failed';
      steps[3].state = 'done';
      steps[4].state = 'active';
      break;
    case 'error':
      steps[0].state = 'done';
      // Mark whatever phase we were in as failed
      break;
  }

  return steps;
}

function StepIcon({ state }: { state: Step['state'] }) {
  switch (state) {
    case 'done':
      return <CheckCircle2 className="size-4 text-emerald-500" />;
    case 'active':
      return <Spinner className="size-4 text-amber-500" />;
    case 'failed':
      return <AlertCircle className="size-4 text-red-500" />;
    case 'pending':
      return <Circle className="size-4 text-muted-foreground/40" />;
  }
}

function formatElapsed(since: number): string {
  const ms = Date.now() - since;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export function PipelineProgressTracker({ status }: PipelineProgressTrackerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (status.phase === 'idle') return null;

  const steps = getSteps(status);
  const elapsed = formatElapsed(status.since);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72">
      <Card className="shadow-lg">
        <CardHeader
          className="flex flex-row items-center justify-between py-2 px-3 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="text-sm font-medium">Pipeline Progress</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{elapsed}</span>
            {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </div>
        </CardHeader>
        {!collapsed && (
          <CardContent className="px-3 pb-3 pt-0">
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    step.state === 'pending' && 'text-muted-foreground/50',
                    step.state === 'active' && 'text-foreground font-medium',
                    step.state === 'done' && 'text-muted-foreground',
                    step.state === 'failed' && 'text-red-500',
                  )}
                >
                  <StepIcon state={step.state} />
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
            {status.fixAttempt != null && status.fixAttempt > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                Fix attempt {status.fixAttempt}/{status.maxAttempts}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
