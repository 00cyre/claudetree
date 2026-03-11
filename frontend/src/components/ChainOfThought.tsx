"use client";

import { useState, createContext, useContext, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Circle,
  CheckCircle2,
  Loader2,
  FileCode2,
} from "lucide-react";

type StepStatus = "complete" | "active" | "pending";

const StatusIcons: Record<StepStatus, typeof Circle> = {
  complete: CheckCircle2,
  active: Loader2,
  pending: Circle,
};

/* ── Context ──────────────────────────────────────────────────── */

interface ChainOfThoughtState {
  open: boolean;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtState | null>(null);

function useChainOfThought(): ChainOfThoughtState {
  const ctx = useContext(ChainOfThoughtContext);
  if (!ctx) throw new Error("Must be used within <ChainOfThought>");
  return ctx;
}

/* ── Root ─────────────────────────────────────────────────────── */

interface ChainOfThoughtProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

function ChainOfThoughtRoot({
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  children,
  className,
}: ChainOfThoughtProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;

  const handleChange = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <ChainOfThoughtContext.Provider value={{ open }}>
      <Collapsible open={open} onOpenChange={handleChange}>
        <div
          className={cn(
            "rounded-lg border border-border bg-card overflow-hidden",
            className,
          )}
        >
          {children}
        </div>
      </Collapsible>
    </ChainOfThoughtContext.Provider>
  );
}

/* ── Header ───────────────────────────────────────────────────── */

interface ChainOfThoughtHeaderProps {
  children?: ReactNode;
  className?: string;
}

function ChainOfThoughtHeader({
  children = "Code Analysis",
  className,
}: ChainOfThoughtHeaderProps) {
  const { open } = useChainOfThought();

  return (
    <CollapsibleTrigger asChild>
      <button
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-sm font-medium",
          "text-foreground hover:bg-muted/50 transition-colors cursor-pointer",
          className,
        )}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        {children}
      </button>
    </CollapsibleTrigger>
  );
}

/* ── Content ──────────────────────────────────────────────────── */

interface ChainOfThoughtContentProps {
  children: ReactNode;
  className?: string;
}

function ChainOfThoughtContentWrapper({
  children,
  className,
}: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent>
      <div className={cn("px-4 pb-4", className)}>
        <div className="relative ml-2">
          {children}
        </div>
      </div>
    </CollapsibleContent>
  );
}

/* ── Step ─────────────────────────────────────────────────────── */

interface ChainOfThoughtStepProps {
  id?: string;
  icon?: typeof Circle;
  label: string;
  description?: string;
  status?: StepStatus;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

function ChainOfThoughtStep({
  id: stepId,
  icon,
  label,
  description,
  status = "complete",
  children,
  defaultOpen = false,
  className,
}: ChainOfThoughtStepProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = icon ?? StatusIcons[status];

  const statusColor = {
    complete: "text-green-500",
    active: "text-blue-400",
    pending: "text-muted-foreground",
  }[status];

  const hasContent = !!children;

  return (
    <div id={stepId} className={cn("relative pl-6", className)}>
      {/* Vertical connector line */}
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />

      {/* Step indicator */}
      <div className="absolute left-0 top-3 z-10 flex items-center justify-center w-[15px] h-[15px] bg-card">
        <Icon
          className={cn("h-[15px] w-[15px]", statusColor, status === "active" && "animate-spin")}
        />
      </div>

      {hasContent ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-start gap-2 py-2 text-left cursor-pointer group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {label}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground transition-transform duration-200 shrink-0",
                      open && "rotate-180",
                    )}
                  />
                </div>
                {description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {description}
                  </p>
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-2">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="py-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── File Reference (sub-element for steps) ───────────────────── */

interface ChainOfThoughtFileRefProps {
  filename: string;
  additions?: number;
  deletions?: number;
  className?: string;
}

function ChainOfThoughtFileRef({
  filename,
  additions,
  deletions,
  className,
}: ChainOfThoughtFileRefProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 rounded bg-muted/50",
        className,
      )}
    >
      <FileCode2 className="h-3 w-3 shrink-0" />
      <span className="font-mono truncate">{filename}</span>
      {(additions !== undefined || deletions !== undefined) && (
        <span className="ml-auto flex gap-1 shrink-0">
          {additions !== undefined && additions > 0 && (
            <span className="text-green-500">+{additions}</span>
          )}
          {deletions !== undefined && deletions > 0 && (
            <span className="text-red-500">-{deletions}</span>
          )}
        </span>
      )}
    </div>
  );
}

/* ── Compound export ──────────────────────────────────────────── */

export const ChainOfThought = Object.assign(ChainOfThoughtRoot, {
  Header: ChainOfThoughtHeader,
  Content: ChainOfThoughtContentWrapper,
  Step: ChainOfThoughtStep,
  FileRef: ChainOfThoughtFileRef,
});

export type {
  ChainOfThoughtProps,
  ChainOfThoughtHeaderProps,
  ChainOfThoughtContentProps,
  ChainOfThoughtStepProps,
  ChainOfThoughtFileRefProps,
  StepStatus,
};
