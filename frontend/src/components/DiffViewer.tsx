import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "@/api/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChainOfThought } from "@/components/ChainOfThought";
import { CodeDiff } from "@/components/tool-ui/code-diff";
import { parseDiffHunks, hunkToPatch, describeHunk } from "@/utils/diffParser";
import { languageFromFilename } from "@/utils/language";
import type { FileDetailedAnalysis, HunkExplanation, TicketContext } from "@/types";
import type { StepStatus } from "@/components/ChainOfThought";
import { Loader2 } from "lucide-react";

interface DiffViewerProps {
  worktreeId: string;
  file: string;
  explanation?: string;
  aiConnected?: boolean;
  ticketContext?: TicketContext;
}

export function DiffViewer({
  worktreeId,
  file,
  explanation,
  aiConnected,
  ticketContext,
}: DiffViewerProps) {
  const [diff, setDiff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fileAnalysis, setFileAnalysis] = useState<FileDetailedAnalysis | null>(
    null,
  );
  const [analyzing, setAnalyzing] = useState(false);
  const lastAnalyzedKey = useRef<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setFileAnalysis(null);
    lastAnalyzedKey.current = null;
    api
      .getFileDiff(worktreeId, file)
      .then((data) => setDiff(data.diff))
      .catch((err) => setDiff(`Error loading diff: ${err}`))
      .finally(() => setLoading(false));
  }, [worktreeId, file]);

  useEffect(() => {
    if (!aiConnected || !diff || loading) return;

    const key = `${worktreeId}:${file}`;
    if (lastAnalyzedKey.current === key) return;
    lastAnalyzedKey.current = key;

    let cancelled = false;
    setAnalyzing(true);

    api
      .analyzeFile(worktreeId, file, ticketContext)
      .then((result) => {
        if (!cancelled) setFileAnalysis(result);
      })
      .catch((err) => {
        console.error("File analysis failed:", err);
        if (!cancelled) lastAnalyzedKey.current = null;
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreeId, file, aiConnected, diff, loading]);

  const hunks = useMemo(() => parseDiffHunks(diff), [diff]);
  const language = useMemo(() => languageFromFilename(file), [file]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading diff...
      </div>
    );
  }
  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No changes
      </div>
    );
  }

  const stepsMap = new Map<number, HunkExplanation>();
  if (fileAnalysis) {
    for (const step of fileAnalysis.steps) {
      stepsMap.set(step.hunkIndex, step);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-border font-mono text-sm text-muted-foreground shrink-0 flex items-center gap-2">
        <span className="truncate">{file}</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Chain of thought analysis */}
          <ChainOfThought defaultOpen={true}>
            <ChainOfThought.Header>
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing changes...
                </span>
              ) : fileAnalysis ? (
                "Code Analysis"
              ) : explanation ? (
                "Overview"
              ) : (
                "Changes"
              )}
            </ChainOfThought.Header>
            <ChainOfThought.Content>
              {/* Overall explanation */}
              {(fileAnalysis?.overview || explanation) && (
                <p className="text-sm text-muted-foreground mb-3 pl-8">
                  {fileAnalysis?.overview ?? explanation}
                </p>
              )}

              {/* Per-hunk steps */}
              {hunks.map((hunk, i) => {
                const step = stepsMap.get(i);
                const label = step?.title ?? describeHunk(hunk);
                const description = step?.description;
                const status: StepStatus = fileAnalysis
                  ? "complete"
                  : analyzing
                    ? i === 0
                      ? "active"
                      : "pending"
                    : "complete";

                return (
                  <ChainOfThought.Step
                    key={i}
                    label={label}
                    description={description}
                    status={status}
                    defaultOpen={hunks.length <= 3}
                  >
                    <div className="mt-2">
                      <CodeDiff
                        id={`${file}-hunk-${i}`}
                        patch={hunkToPatch(hunk, file)}
                        language={language}
                        filename={file}
                        lineNumbers="visible"
                        diffStyle="unified"
                        maxCollapsedLines={40}
                      />
                    </div>
                  </ChainOfThought.Step>
                );
              })}

              {hunks.length === 0 && (
                <p className="text-sm text-muted-foreground pl-8">
                  No parseable hunks in this diff.
                </p>
              )}
            </ChainOfThought.Content>
          </ChainOfThought>

          {/* Full diff fallback only when no parseable hunks */}
          {hunks.length === 0 && diff.length > 0 && (
            <CodeDiff
              id={`${file}-full`}
              patch={diff.startsWith("--- ") ? diff : `--- a/${file}\n+++ b/${file}\n${diff}`}
              language={language}
              filename={file}
              lineNumbers="visible"
              diffStyle="unified"
              maxCollapsedLines={20}
              defaultExpanded={true}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
