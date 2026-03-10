export interface DiffHunk {
  header: string;
  functionContext: string | null;
  lines: string[];
  additions: number;
  deletions: number;
  startLineOld: number;
  startLineNew: number;
}

const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@\s*(.*)?$/;

export function parseDiffHunks(diff: string): DiffHunk[] {
  const rawLines = diff.split("\n");
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  for (const line of rawLines) {
    const match = line.match(HUNK_HEADER_RE);
    if (match) {
      if (current) hunks.push(current);
      current = {
        header: line,
        functionContext: match[3]?.trim() || null,
        lines: [line],
        additions: 0,
        deletions: 0,
        startLineOld: parseInt(match[1], 10),
        startLineNew: parseInt(match[2], 10),
      };
      continue;
    }

    if (!current) continue;

    current.lines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletions++;
    }
  }

  if (current) hunks.push(current);
  return hunks;
}

export function hunkToPatch(hunk: DiffHunk, filePath?: string): string {
  const hunkBody = hunk.lines.join("\n");
  if (!filePath) return hunkBody;
  const a = `a/${filePath}`;
  const b = `b/${filePath}`;
  return `--- ${a}\n+++ ${b}\n${hunkBody}`;
}

export function describeHunk(hunk: DiffHunk): string {
  if (hunk.functionContext) return hunk.functionContext;
  const parts: string[] = [];
  if (hunk.additions > 0) parts.push(`+${hunk.additions}`);
  if (hunk.deletions > 0) parts.push(`-${hunk.deletions}`);
  return `Lines ${hunk.startLineNew}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
}
