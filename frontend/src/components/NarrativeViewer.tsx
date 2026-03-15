import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { NarrativeAnalysis, NarrativePhase, NarrativeStep, TicketContext } from '@/types';
import { api } from '@/api/client';
import { ChainOfThought } from '@/components/ChainOfThought';
import { CodeDiff } from '@/components/tool-ui/code-diff/code-diff';
import { ScrollArea } from '@/components/ui/scroll-area';
import { languageFromFilename } from '@/utils/language';
import { Loader2, ArrowRight, AlertCircle, TicketCheck } from 'lucide-react';

const STORAGE_PREFIX = 'claudetree:narrative:';

function loadFromStorage(key: string): NarrativeAnalysis | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as NarrativeAnalysis;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, data: NarrativeAnalysis): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

interface NarrativeViewerProps {
  worktreeId: string;
  baseBranch: string;
  aiConnected: boolean;
  ticketContext?: TicketContext;
}

export function NarrativeViewer({ worktreeId, baseBranch, aiConnected, ticketContext }: NarrativeViewerProps) {
  const [narrative, setNarrative] = useState<NarrativeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeKeyRef = useRef<string | null>(null);
  const inflightKeyRef = useRef<string | null>(null);

  const cacheKey = `${worktreeId}:${baseBranch}`;
  activeKeyRef.current = cacheKey;

  // When the worktree/branch changes, immediately show persisted result or clear stale state
  useEffect(() => {
    const persisted = loadFromStorage(cacheKey);
    if (persisted) {
      setNarrative(persisted);
      setError(null);
      setLoading(false);
    } else {
      setNarrative(null);
      setError(null);
    }
  }, [cacheKey]);

  // Fetch narrative — sends cached fingerprint so the backend can short-circuit
  useEffect(() => {
    if (!worktreeId || !aiConnected) return;
    if (inflightKeyRef.current === cacheKey) return;

    let cancelled = false;
    inflightKeyRef.current = cacheKey;

    const persisted = loadFromStorage(cacheKey);
    // Only show loading spinner if we have nothing to display yet
    if (!persisted) {
      setLoading(true);
      setError(null);
    }

    const cachedFingerprint = persisted?.fingerprint;

    api.analyzeNarrative(worktreeId, baseBranch, ticketContext, cachedFingerprint)
      .then((result) => {
        if (cancelled || activeKeyRef.current !== cacheKey) return;

        if (result.cached) {
          // Backend confirmed our cached version is still current — nothing to update
          setLoading(false);
          return;
        }

        saveToStorage(cacheKey, result);
        setNarrative(result);
      })
      .catch((err) => {
        console.error('Narrative analysis failed:', err);
        inflightKeyRef.current = null;
        if (!cancelled && activeKeyRef.current === cacheKey) {
          // Only show error if we have nothing cached to display
          if (!persisted) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      })
      .finally(() => {
        if (!cancelled && activeKeyRef.current === cacheKey) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      // Reset inflight guard so a StrictMode remount (or real remount) can retry
      if (inflightKeyRef.current === cacheKey) {
        inflightKeyRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, aiConnected]);

  // Build step lookup across all phases
  const stepLookup = useMemo(() => {
    if (!narrative) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const p of narrative.phases) {
      for (const s of p.steps) {
        map.set(s.id, s.title);
      }
    }
    return map;
  }, [narrative]);

  if (!aiConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm text-center">
          AI is not configured. Set up your Anthropic API key to enable narrative analysis.
        </p>
      </div>
    );
  }

  if (loading) {
    return <NarrativeLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-center">Analysis failed: {error}</p>
        <button
          className="text-xs text-primary hover:underline cursor-pointer"
          onClick={() => {
            inflightKeyRef.current = null;
            removeFromStorage(cacheKey);
            setError(null);
            setLoading(true);
            api.analyzeNarrative(worktreeId, baseBranch, ticketContext)
              .then((result) => {
                if (activeKeyRef.current !== cacheKey) return;
                if (!result.cached) {
                  saveToStorage(cacheKey, result);
                  setNarrative(result);
                }
              })
              .catch((err) => {
                if (activeKeyRef.current === cacheKey) setError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => {
                if (activeKeyRef.current === cacheKey) setLoading(false);
              });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!narrative) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No narrative available
      </div>
    );
  }

  if (narrative.filesAnalyzed === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
        <p className="text-sm font-medium">No changes yet</p>
        <p className="text-xs text-center max-w-[240px]">
          This worktree has no changes compared to the base branch. Start coding and changes will appear here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Summary header */}
        <div className="space-y-2">
          <p className="text-sm text-foreground leading-relaxed">{narrative.summary}</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{narrative.filesAnalyzed} files</span>
            {narrative.totalAdditions > 0 && (
              <span className="text-green-600 dark:text-green-400">+{narrative.totalAdditions}</span>
            )}
            {narrative.totalDeletions > 0 && (
              <span className="text-red-600 dark:text-red-400">-{narrative.totalDeletions}</span>
            )}
          </div>
        </div>

        {/* Single unified chain of thought — all steps expanded */}
        <ChainOfThought open={true}>
          <ChainOfThought.Header>Change Narrative</ChainOfThought.Header>
          <ChainOfThought.Content>
            {narrative.phases.map((phase, pi) => (
              <div key={pi}>
                {/* Phase divider */}
                <div className="mt-3 mb-1 first:mt-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {phase.title}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {phase.labels.length > 0 && (
                    <div className="flex flex-col gap-1 ml-1">
                      {phase.labels.map((label, li) => (
                        <span
                          key={li}
                          className="text-[10px] font-medium uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded w-fit"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {phase.description && (
                  <p className="text-xs text-muted-foreground mb-2 ml-6">{phase.description}</p>
                )}

                {/* Steps — all expanded by default */}
                {phase.steps.map((step) => (
                  <ChainOfThought.Step
                    key={step.id}
                    id={step.id}
                    label={step.title}
                    description={step.description}
                    defaultOpen={true}
                  >
                    {/* Connection references */}
                    {step.connections && step.connections.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {step.connections.map((connId) => (
                          <a
                            key={connId}
                            href={`#${connId}`}
                            className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary bg-primary/5 hover:bg-primary/10 px-2 py-0.5 rounded-full transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              document.getElementById(connId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                          >
                            <ArrowRight className="h-3 w-3" />
                            {stepLookup.get(connId) ?? connId}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* File ref badges */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {step.files.map((sf) => (
                        <ChainOfThought.FileRef key={sf.file} filename={sf.file} />
                      ))}
                    </div>

                    {/* Inline diffs */}
                    {step.files.map((sf) => (
                      sf.diff ? (
                        <div key={sf.file} className="mb-2">
                          <CodeDiff
                            id={`${step.id}-${sf.file}`}
                            patch={sf.diff}
                            language={languageFromFilename(sf.file)}
                            filename={sf.file.split('/').pop()}
                            lineNumbers="visible"
                            diffStyle="unified"
                            maxCollapsedLines={30}
                          />
                        </div>
                      ) : null
                    ))}
                  </ChainOfThought.Step>
                ))}
              </div>
            ))}
          </ChainOfThought.Content>
        </ChainOfThought>

        {/* Ticket correlation section */}
        {narrative.ticketCorrelation && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <TicketCheck className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">
                Ticket Correlation
              </span>
              <span className="text-xs text-muted-foreground ml-auto font-mono">
                {narrative.ticketCorrelation.ticketId}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {narrative.ticketCorrelation.ticketTitle}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  How these changes relate
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {narrative.ticketCorrelation.correlation}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  How they resolve the issue
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {narrative.ticketCorrelation.resolution}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function NarrativeLoadingSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Analyzing all branch changes...</p>
          <p className="text-xs text-muted-foreground mt-0.5">Building a narrative across all files</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden animate-pulse">
        <div className="px-4 py-3">
          <div className="h-4 bg-muted rounded w-1/4" />
        </div>
        <div className="px-4 pb-4 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 pl-6">
              <div className="h-3.5 bg-muted rounded w-2/5" />
              <div className="h-3 bg-muted/70 rounded w-3/5" />
              <div className="h-16 bg-muted/30 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
