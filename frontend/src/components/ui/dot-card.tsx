import { cn } from '@/lib/utils';

interface DotCardProps {
  children: React.ReactNode;
  className?: string;
}

export function DotCard({ children, className }: DotCardProps) {
  return (
    <div className={cn('border rounded-xl border-border/70 p-1', className)}>
      <div className="rounded-lg bg-muted/20 p-3">
        {children}
      </div>
    </div>
  );
}
