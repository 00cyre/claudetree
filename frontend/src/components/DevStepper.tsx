import type { DevStep } from '@/types';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS: { key: DevStep; label: string }[] = [
  { key: 'dev', label: 'Dev' },
  { key: 'review', label: 'Review' },
  { key: 'pr', label: 'PR' },
  { key: 'merged', label: 'Merged' },
];

function stepIndex(step: DevStep): number {
  return STEPS.findIndex(s => s.key === step);
}

export function DevStepper({ currentStep, onStepClick }: { currentStep: DevStep; onStepClick?: (step: DevStep) => void }) {
  const activeIdx = stepIndex(currentStep);

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const isCompleted = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={cn(
                'w-2 h-px',
                isCompleted || isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30',
              )} />
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStepClick?.(step.key); }}
              disabled={!onStepClick}
              className={cn(
                'rounded-full flex items-center justify-center',
                isCompleted && 'size-2.5 bg-emerald-500',
                isActive && 'size-2.5 bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)]',
                !isCompleted && !isActive && 'size-2.5 bg-muted-foreground/30',
                onStepClick && 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400/50',
              )}
              title={step.label}
            >
              {isCompleted && <Check className="size-1.5 text-white" strokeWidth={3} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
