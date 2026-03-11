import Anthropic from '@anthropic-ai/sdk';

export interface AnalysisResult {
  sortOrder: string[];
  explanations: Record<string, string>;
  summary: string;
  fileGroups?: Record<string, string[]>;
}

interface FileDiff {
  file: string;
  diff: string;
}

interface TicketContext {
  id: string;
  title: string;
  description?: string;
}

function isOAuthToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
}

function createClient(key: string): Anthropic {
  if (isOAuthToken(key)) {
    return new Anthropic({
      authToken: key,
      apiKey: null,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  }
  return new Anthropic({ apiKey: key });
}

const SYSTEM_PROMPT = `You analyze code changes in a git worktree. Given a list of changed files and their diffs, you must:

1. Sort the files in a logical reading order so a reviewer can follow the changes top-down. Put entry points and routes first, then the components/modules they reference, then shared libraries/utilities last. If file A imports from file B, file A should come before file B.

2. Write a 1-2 sentence explanation for each file describing what changed and why.

3. Write a brief overall summary (1-2 sentences) of all the changes together.

4. Group related files: if a file is a test, spec, story, mock, fixture, or type definition that directly supports another changed file, group it under that parent. The parent is the primary implementation file. Only group files that are tightly coupled — not every file in the same directory.

Return ONLY valid JSON with this exact structure:
{
  "sortOrder": ["file1.ts", "file2.ts", ...],
  "explanations": {
    "file1.ts": "explanation of changes",
    "file2.ts": "explanation of changes"
  },
  "summary": "overall summary of all changes",
  "fileGroups": {
    "file1.ts": ["file1.test.ts", "file1.mock.ts"]
  }
}`;

export async function analyzeChanges(
  apiKey: string,
  fileDiffs: FileDiff[],
  ticketContext?: TicketContext,
): Promise<AnalysisResult> {
  if (fileDiffs.length === 0) {
    return { sortOrder: [], explanations: {}, summary: 'No changes.' };
  }

  const client = createClient(apiKey);

  const userContent = fileDiffs
    .map((fd) => `### ${fd.file}\n\`\`\`diff\n${fd.diff.slice(0, 4000)}\n\`\`\``)
    .join('\n\n');

  let ticketSection = '';
  if (ticketContext) {
    ticketSection = `\n\nThis work is for ticket **${ticketContext.id}: ${ticketContext.title}**.${ticketContext.description ? `\n\nTicket description:\n${ticketContext.description.slice(0, 2000)}` : ''}\n\nRelate your explanations to this ticket — explain how each file's changes contribute to the ticket's goal.\n\n`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${ticketSection}Analyze these ${fileDiffs.length} changed files:\n\n${userContent}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI returned no valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;

  const fileSet = new Set(fileDiffs.map((f) => f.file));
  const sortOrder = (parsed.sortOrder ?? []).filter((f) => fileSet.has(f));
  for (const f of fileDiffs) {
    if (!sortOrder.includes(f.file)) sortOrder.push(f.file);
  }

  // Validate fileGroups: only keep entries where both parent and children exist in the changeset
  const fileGroups: Record<string, string[]> = {};
  if (parsed.fileGroups) {
    for (const [parent, children] of Object.entries(parsed.fileGroups)) {
      if (!fileSet.has(parent)) continue;
      const validChildren = (children ?? []).filter((c) => fileSet.has(c) && c !== parent);
      if (validChildren.length > 0) fileGroups[parent] = validChildren;
    }
  }

  return {
    sortOrder,
    explanations: parsed.explanations ?? {},
    summary: parsed.summary ?? '',
    fileGroups: Object.keys(fileGroups).length > 0 ? fileGroups : undefined,
  };
}

export interface HunkExplanation {
  hunkIndex: number;
  title: string;
  description: string;
}

export interface FileDetailedAnalysis {
  file: string;
  overview: string;
  steps: HunkExplanation[];
}

const FILE_ANALYSIS_PROMPT = `You analyze a single file's code changes in detail. Given a file's unified diff, you must:

1. Write a brief overview (1-2 sentences) of what changed in this file overall.

2. For each hunk (section between @@ markers), write:
   - A short title (3-8 words) describing the change
   - A detailed explanation (1-3 sentences) of what the change does and why

Return ONLY valid JSON with this exact structure:
{
  "overview": "Overall summary of changes in this file",
  "steps": [
    {
      "hunkIndex": 0,
      "title": "Short title for hunk 0",
      "description": "Detailed explanation of what changed and why"
    },
    {
      "hunkIndex": 1,
      "title": "Short title for hunk 1",
      "description": "Detailed explanation of what changed and why"
    }
  ]
}

The hunkIndex must match the zero-based index of hunks in the diff (each @@ header starts a new hunk).`;

export async function analyzeFileDetailed(
  apiKey: string,
  file: string,
  diff: string,
  ticketContext?: TicketContext,
): Promise<FileDetailedAnalysis> {
  if (!diff.trim()) {
    return { file, overview: 'No changes.', steps: [] };
  }

  const client = createClient(apiKey);

  let ticketSection = '';
  if (ticketContext) {
    ticketSection = `This work is for ticket **${ticketContext.id}: ${ticketContext.title}**.${ticketContext.description ? `\nTicket description: ${ticketContext.description.slice(0, 1000)}` : ''}\nRelate your explanations to the ticket's goal.\n\n`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: FILE_ANALYSIS_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${ticketSection}Analyze this diff for \`${file}\`:\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI returned no valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { overview?: string; steps?: HunkExplanation[] };

  return {
    file,
    overview: parsed.overview ?? '',
    steps: (parsed.steps ?? []).map((s, i) => ({
      hunkIndex: s.hunkIndex ?? i,
      title: s.title ?? `Change ${i + 1}`,
      description: s.description ?? '',
    })),
  };
}

// --- Narrative analysis types ---

export interface NarrativeStep {
  id: string;
  title: string;
  description: string;
  files: { file: string; diff: string; hunkIndices?: number[] }[];
  connections?: string[];
}

export interface NarrativePhase {
  title: string;
  labels: string[];
  description: string;
  steps: NarrativeStep[];
}

export interface TicketCorrelation {
  ticketId: string;
  ticketTitle: string;
  correlation: string;    // How the changes relate to the ticket
  resolution: string;     // How the changes fix/address the issue
}

export interface NarrativeAnalysis {
  summary: string;
  phases: NarrativePhase[];
  filesAnalyzed: number;
  totalAdditions: number;
  totalDeletions: number;
  ticketCorrelation?: TicketCorrelation;
}

const NARRATIVE_PROMPT = `You analyze ALL code changes across an entire feature branch compared to its base branch. Given diffs for every changed file (with hunks numbered), you must produce a unified narrative that explains the changes as a coherent story.

Each file's diff is split into numbered hunks (hunk 0, hunk 1, etc.). Each hunk represents a distinct section of changes in that file.

Group changes into logical phases. Good phase names include: "Schema & Data Layer", "Business Logic", "API Routes", "UI Components", "Tests", "Configuration", etc. Use whatever groupings make sense for the actual changes.

Each phase should also have a "labels" array of short tags that categorize the nature of the changes (e.g. "bug fix", "refactor", "new feature", "performance", "security", "breaking change", "config", "tests", "types", "cleanup"). Use as many labels as are relevant — one or more per phase.

Within each phase, create steps that explain WHAT changed and WHY. Each step should:
- Have a clear, concise title (3-10 words)
- Have a description explaining the purpose of this change
- Reference specific files AND which hunks from each file are relevant to THIS step
- Optionally reference connections to other steps (by step ID) when changes in one step depend on or relate to changes in another

IMPORTANT:
- Every changed file (and every hunk within it) MUST appear in at least one step
- When a file has multiple hunks, different steps can reference different hunks of the same file
- Step IDs must be unique strings (use kebab-case like "add-credit-enum", "update-api-handler")
- Connection references must be valid step IDs
- Cross-file relationships are critical — show WHY a change in file A required changes in files B, C, D
- If ticket context is provided, you MUST include a "ticketCorrelation" object that ties the changes back to the ticket

Return ONLY valid JSON matching this structure:
{
  "summary": "2-3 sentence overview of all changes",
  "phases": [
    {
      "title": "Phase Name",
      "labels": ["bug fix", "performance"],
      "description": "What this phase accomplishes",
      "steps": [
        {
          "id": "unique-step-id",
          "title": "Short step title",
          "description": "Why this change was made and what it does",
          "files": [
            { "file": "path/to/file.ts", "hunks": [0, 1] },
            { "file": "path/to/other.ts", "hunks": [0] }
          ],
          "connections": ["other-step-id"]
        }
      ]
    }
  ],
  "ticketCorrelation": {
    "ticketId": "TICKET-123",
    "ticketTitle": "The ticket title",
    "correlation": "Explain how the overall set of changes directly relates to the reported issue or feature request described in the ticket. Reference specific parts of the ticket description.",
    "resolution": "Explain concretely how these changes fix or address the issue. What was broken/missing before, and what does this changeset do to resolve it."
  }
}

The "ticketCorrelation" field is REQUIRED when ticket context is provided. It should be a thoughtful analysis — not just restating the ticket, but showing exactly which changes map to which parts of the reported issue and how they resolve it.`;

// Parse a unified diff into hunks (split on @@ markers)
interface ParsedHunk {
  header: string;   // the @@ line
  lines: string[];  // all lines including the header
}

function parseDiffIntoHunks(diff: string): ParsedHunk[] {
  const rawLines = diff.split('\n');
  const hunks: ParsedHunk[] = [];
  let current: ParsedHunk | null = null;

  for (const line of rawLines) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { header: line, lines: [line] };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
    // Skip file headers (--- / +++ / diff --git) before first hunk
  }
  if (current) hunks.push(current);
  return hunks;
}

function reassembleDiff(file: string, hunks: ParsedHunk[]): string {
  if (hunks.length === 0) return '';
  const header = `--- a/${file}\n+++ b/${file}`;
  return `${header}\n${hunks.map((h) => h.lines.join('\n')).join('\n')}`;
}

export async function analyzeNarrative(
  apiKey: string,
  fileDiffs: FileDiff[],
  ticketContext?: TicketContext,
): Promise<NarrativeAnalysis> {
  if (fileDiffs.length === 0) {
    return { summary: 'No changes.', phases: [], filesAnalyzed: 0, totalAdditions: 0, totalDeletions: 0 };
  }

  const client = createClient(apiKey);

  // Compute stats
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const fd of fileDiffs) {
    for (const line of fd.diff.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) totalAdditions++;
      else if (line.startsWith('-') && !line.startsWith('---')) totalDeletions++;
    }
  }

  // Parse each file's diff into numbered hunks
  const fileHunksMap = new Map<string, ParsedHunk[]>();
  for (const fd of fileDiffs) {
    fileHunksMap.set(fd.file, parseDiffIntoHunks(fd.diff));
  }

  // Build user content with numbered hunks so the AI can reference them
  const userContent = fileDiffs
    .map((fd) => {
      const hunks = fileHunksMap.get(fd.file) ?? [];
      if (hunks.length <= 1) {
        // Single hunk or no hunks — show as-is
        return `### ${fd.file} (1 hunk)\n\`\`\`diff\n${fd.diff.slice(0, 6000)}\n\`\`\``;
      }
      // Label each hunk with its index
      const labeled = hunks.map((h, i) => {
        const preview = h.lines.join('\n').slice(0, 3000);
        return `**Hunk ${i}:**\n\`\`\`diff\n${preview}\n\`\`\``;
      }).join('\n');
      return `### ${fd.file} (${hunks.length} hunks)\n${labeled}`;
    })
    .join('\n\n');

  let ticketSection = '';
  if (ticketContext) {
    ticketSection = `\n\nThis work is for ticket **${ticketContext.id}: ${ticketContext.title}**.${ticketContext.description ? `\n\nTicket description:\n${ticketContext.description.slice(0, 2000)}` : ''}\n\nRelate your narrative to this ticket — explain how each phase and step contributes to the ticket's goal.\n\n`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: NARRATIVE_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${ticketSection}Analyze these ${fileDiffs.length} changed files as a unified narrative:\n\n${userContent}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI returned no valid JSON');
  }

  // The AI now returns files as objects with hunk indices
  const parsed = JSON.parse(jsonMatch[0]) as {
    summary?: string;
    phases?: {
      title?: string;
      labels?: string[];
      description?: string;
      steps?: {
        id?: string;
        title?: string;
        description?: string;
        files?: (string | { file: string; hunks?: number[] })[];
        connections?: string[];
      }[];
    }[];
    ticketCorrelation?: {
      ticketId?: string;
      ticketTitle?: string;
      correlation?: string;
      resolution?: string;
    };
  };

  const allFiles = new Set(fileDiffs.map((f) => f.file));
  const referencedFiles = new Set<string>();
  const stepIds = new Set<string>();

  // Post-process phases and steps, attaching only the relevant hunks
  const phases: NarrativePhase[] = (parsed.phases ?? []).map((phase, pi) => {
    const steps: NarrativeStep[] = (phase.steps ?? []).map((step, si) => {
      const id = step.id || `phase-${pi}-step-${si}`;
      stepIds.add(id);

      const stepFiles = (step.files ?? [])
        .map((f) => {
          // Normalize: AI might return string or {file, hunks} object
          const fileName = typeof f === 'string' ? f : f.file;
          const hunkIndices = typeof f === 'string' ? undefined : f.hunks;
          return { fileName, hunkIndices };
        })
        .filter((f) => allFiles.has(f.fileName))
        .map(({ fileName, hunkIndices }) => {
          referencedFiles.add(fileName);
          const allHunks = fileHunksMap.get(fileName) ?? [];

          let diff: string;
          if (hunkIndices && hunkIndices.length > 0 && allHunks.length > 1) {
            // Extract only the relevant hunks
            const validIndices = hunkIndices.filter((i) => i >= 0 && i < allHunks.length);
            if (validIndices.length > 0) {
              const selected = validIndices.map((i) => allHunks[i]);
              diff = reassembleDiff(fileName, selected);
            } else {
              diff = reassembleDiff(fileName, allHunks);
            }
          } else {
            // Single hunk or no indices specified — use full diff
            diff = reassembleDiff(fileName, allHunks);
          }

          return { file: fileName, diff, hunkIndices };
        });

      return {
        id,
        title: step.title ?? `Step ${si + 1}`,
        description: step.description ?? '',
        files: stepFiles,
        connections: step.connections,
      };
    });

    return {
      title: phase.title ?? `Phase ${pi + 1}`,
      labels: (phase.labels ?? []).filter((l) => typeof l === 'string' && l.trim()),
      description: phase.description ?? '',
      steps,
    };
  });

  // Ensure all files are referenced — add unreferenced files to an "Other Changes" phase
  const unreferenced = [...allFiles].filter((f) => !referencedFiles.has(f));
  if (unreferenced.length > 0) {
    phases.push({
      title: 'Other Changes',
      labels: [],
      description: 'Additional files that were modified',
      steps: unreferenced.map((f, i) => ({
        id: `other-${i}`,
        title: f.split('/').pop() ?? f,
        description: `Changes to ${f}`,
        files: [{ file: f, diff: reassembleDiff(f, fileHunksMap.get(f) ?? []) }],
      })),
    });
  }

  // Validate connection references — only keep valid step IDs
  for (const phase of phases) {
    for (const step of phase.steps) {
      if (step.connections) {
        step.connections = step.connections.filter((c) => stepIds.has(c) && c !== step.id);
        if (step.connections.length === 0) delete step.connections;
      }
    }
  }

  // Extract ticket correlation if the AI provided one.
  // Always use the real ticket context for ID/title — never trust AI output for those.
  let ticketCorrelation: TicketCorrelation | undefined;
  if (parsed.ticketCorrelation && ticketContext) {
    const tc = parsed.ticketCorrelation;
    if (tc.correlation || tc.resolution) {
      ticketCorrelation = {
        ticketId: ticketContext.id,
        ticketTitle: ticketContext.title,
        correlation: tc.correlation ?? '',
        resolution: tc.resolution ?? '',
      };
    }
  }

  return {
    summary: parsed.summary ?? '',
    phases,
    filesAnalyzed: allFiles.size,
    totalAdditions,
    totalDeletions,
    ticketCorrelation,
  };
}

export async function validateApiKey(key: string): Promise<void> {
  const client = createClient(key);
  try {
    await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4,
      messages: [{ role: 'user', content: 'Say ok' }],
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status: number }).status;
      if (status === 401) {
        const hint = isOAuthToken(key)
          ? 'OAuth token may be expired or not authorized for API access. Try running `claude setup-token` to refresh it.'
          : 'Please check that your API key is correct and active.';
        throw new Error(`Authentication failed — ${hint}`);
      }
      if (status === 403) {
        throw new Error('Access denied — your API key may lack the required permissions.');
      }
      if (status === 429) {
        throw new Error('Rate limited — the key is valid but has hit its usage limit. Try again shortly.');
      }
    }
    throw new Error('Could not reach the Anthropic API. Please try again.');
  }
}
