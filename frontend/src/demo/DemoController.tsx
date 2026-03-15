import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DEMO_PHASES, PHASE_LABELS, type DemoPhase } from './timeline';

const PHASE_COLORS: Record<DemoPhase, string> = {
  'idle': 'bg-muted text-muted-foreground',
  'new-worktree': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'development': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'review': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'fix-ci': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'address-comments': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'approved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'merged': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

interface DemoControllerProps {
  phase: DemoPhase;
  slideIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

export function DemoController({
  phase,
  slideIndex,
  onPrev,
  onNext,
}: DemoControllerProps) {
  const isFirst = slideIndex <= 0;
  const isLast = slideIndex >= DEMO_PHASES.length - 1;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card/95 backdrop-blur-md border border-border rounded-full px-4 py-2 shadow-lg">
      <Badge variant="secondary" className="text-[10px] font-mono">
        DEMO
      </Badge>

      {/* Step dots */}
      <div className="flex items-center gap-1.5">
        {DEMO_PHASES.map((p, i) => (
          <div
            key={p}
            className={cn(
              'size-2 rounded-full transition-all',
              i === slideIndex
                ? 'bg-primary scale-125'
                : i < slideIndex
                  ? 'bg-primary/40'
                  : 'bg-muted-foreground/20',
            )}
          />
        ))}
      </div>

      <Badge variant="secondary" className={cn('text-[10px]', PHASE_COLORS[phase])}>
        {PHASE_LABELS[phase]}
      </Badge>

      <span className="text-[10px] text-muted-foreground font-mono">
        {slideIndex + 1}/{DEMO_PHASES.length}
      </span>

      <div className="w-px h-5 bg-border" />

      {/* Navigation */}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        disabled={isFirst}
        onClick={onPrev}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <Button
        size="sm"
        variant="default"
        className="gap-1.5 h-7 text-xs px-3"
        disabled={isLast}
        onClick={onNext}
      >
        Next
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}
