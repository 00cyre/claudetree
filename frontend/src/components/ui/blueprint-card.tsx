import { cn } from '@/lib/utils';

interface BlueprintCardProps {
  children: React.ReactNode;
  className?: string;
}

export function BlueprintCard({ children, className }: BlueprintCardProps) {
  return (
    <div className={cn('border-4 rounded-xl dark:border-card border-foreground/80 p-px dark:p-0.5', className)}>
      <div className="rounded-lg border-none bg-card dark:bg-card p-3 shadow-none">
        {children}
      </div>
    </div>
  );
}
