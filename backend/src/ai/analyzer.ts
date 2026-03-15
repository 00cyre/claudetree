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

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function isOAuthToken(key: string): boolean {
  return key.startsWith('sk-ant-oat');
}

function createClient(key: string): Anthropic {
  const timeout = 10 * 60 * 1000; // 10 minutes
  if (isOAuthToken(key)) {
    return new Anthropic({
      authToken: key,
      apiKey: null,
      timeout,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20,output-128k-2025-02-19' },
    });
  }
  return new Anthropic({
    apiKey: key,
    timeout,
    defaultHeaders: { 'anthropic-beta': 'output-128k-2025-02-19' },
  });
}

/**
 * Stream a message and return the full text content.
 * Required for large max_tokens values where the SDK enforces streaming.
 */
async function streamMessage(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<string> {
  const stream = client.messages.stream({ ...params, stream: true });
  const response = await stream.finalMessage();
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Attempt to parse JSON, repairing common truncation issues from AI output.
 * Tries raw parse first, then attempts to close unclosed brackets/braces.
 */
function parseJsonLenient(text: string): unknown {
  // First try direct parse
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned no valid JSON');

  let json = jsonMatch[0];
  try {
    return JSON.parse(json);
  } catch {
    // AI output was likely truncated — try to repair
  }

  // Strip trailing partial strings (unmatched quotes)
  json = json.replace(/,\s*"[^"]*$/, '');

  // Close unclosed brackets and braces
  const opens: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of json) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') opens.push(ch);
    else if (ch === '}' || ch === ']') opens.pop();
  }

  // If we're inside a string, close it
  if (inString) json += '"';

  // Close all unclosed structures
  while (opens.length > 0) {
    const open = opens.pop();
    // Remove trailing comma before closing
    json = json.replace(/,\s*$/, '');
    json += open === '{' ? '}' : ']';
  }

  return JSON.parse(json);
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
  model?: string,
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

  const text = await streamMessage(client, {
    model: model || DEFAULT_MODEL,
    max_tokens: 64_000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${ticketSection}Analyze these ${fileDiffs.length} changed files:\n\n${userContent}`,
      },
    ],
  });

  const parsed = parseJsonLenient(text) as AnalysisResult;

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
  model?: string,
): Promise<FileDetailedAnalysis> {
  if (!diff.trim()) {
    return { file, overview: 'No changes.', steps: [] };
  }

  const client = createClient(apiKey);

  let ticketSection = '';
  if (ticketContext) {
    ticketSection = `This work is for ticket **${ticketContext.id}: ${ticketContext.title}**.${ticketContext.description ? `\nTicket description: ${ticketContext.description.slice(0, 1000)}` : ''}\nRelate your explanations to the ticket's goal.\n\n`;
  }

  const text = await streamMessage(client, {
    model: model || DEFAULT_MODEL,
    max_tokens: 64_000,
    system: FILE_ANALYSIS_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${ticketSection}Analyze this diff for \`${file}\`:\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``,
      },
    ],
  });

  const parsed = parseJsonLenient(text) as { overview?: string; steps?: HunkExplanation[] };

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

// --- Two-stage narrative pipeline: outline + parallel phase details ---

const NARRATIVE_OUTLINE_PROMPT = `You organize code changes into a logical narrative structure. Given a list of changed files with brief change previews and statistics, you must:

1. Group files into logical phases (e.g., "Schema & Data Layer", "Business Logic", "API Routes", "UI Components", "Tests", "Configuration")
2. Within each phase, create steps that cover groups of related files
3. Assign each file to exactly one step

Focus ONLY on structure and organization. Detailed descriptions will be added in a separate pass.

IMPORTANT:
- Every file MUST appear in exactly one step
- Step IDs must be unique kebab-case strings
- Labels: "bug fix", "refactor", "new feature", "performance", "security", "breaking change", "config", "tests", "types", "cleanup"

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview of all changes",
  "phases": [
    {
      "title": "Phase Name",
      "labels": ["new feature"],
      "description": "Brief description of what this phase accomplishes",
      "steps": [
        {
          "id": "unique-step-id",
          "title": "Short step title (3-10 words)",
          "files": ["path/to/file1.ts", "path/to/file2.ts"]
        }
      ]
    }
  ],
  "ticketCorrelation": {
    "ticketId": "TICKET-123",
    "ticketTitle": "Title",
    "correlation": "How changes relate to ticket",
    "resolution": "How changes resolve the issue"
  }
}

The "ticketCorrelation" field is REQUIRED when ticket context is provided.`;

const PHASE_DETAIL_PROMPT = `You analyze code changes for one phase of a code review narrative. You are given:
1. The phase title and step outline (step IDs, titles, and assigned files)
2. Full diffs for all files in this phase, with hunks numbered
3. A list of all step IDs across ALL phases (for cross-phase connections)

For each step, you must:
- Write a description (1-3 sentences) explaining WHAT changed and WHY
- For each file, identify which specific hunks are relevant to this step
- Identify connections to other steps when changes are related

Return ONLY valid JSON:
{
  "steps": [
    {
      "id": "existing-step-id",
      "description": "Detailed description of what this change does and why",
      "files": [
        { "file": "path/to/file.ts", "hunks": [0, 2] }
      ],
      "connections": ["other-step-id"]
    }
  ]
}

Rules:
- Use the EXACT step IDs from the outline
- Hunks are zero-indexed
- Only add connections when changes are genuinely dependent or related
- Connections can reference step IDs from other phases`;

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

// --- Stage 1: Outline (fast call with abbreviated diffs) ---

interface OutlineStep {
  id: string;
  title: string;
  files: string[];
}

interface OutlinePhase {
  title: string;
  labels: string[];
  description: string;
  steps: OutlineStep[];
}

interface NarrativeOutline {
  summary: string;
  phases: OutlinePhase[];
  ticketCorrelation?: TicketCorrelation;
}

function buildFilePreview(fd: FileDiff): string {
  const lines = fd.diff.split('\n');
  let adds = 0, dels = 0;
  const hunkHeaders: string[] = [];
  for (const l of lines) {
    if (l.startsWith('+') && !l.startsWith('+++')) adds++;
    else if (l.startsWith('-') && !l.startsWith('---')) dels++;
    else if (l.startsWith('@@')) hunkHeaders.push(l);
  }
  // Show hunk headers for function/class context
  const hunkPreview = hunkHeaders.length > 0
    ? `\nRegions: ${hunkHeaders.slice(0, 6).join(' | ')}`
    : '';
  // First 10 change lines as a preview
  const changeLines = lines
    .filter(l => (l.startsWith('+') && !l.startsWith('+++')) || (l.startsWith('-') && !l.startsWith('---')))
    .slice(0, 10)
    .join('\n');
  return `### ${fd.file} (+${adds}/-${dels}, ${hunkHeaders.length} hunks)${hunkPreview}\n\`\`\`\n${changeLines.slice(0, 400)}\n\`\`\``;
}

async function getNarrativeOutline(
  client: Anthropic,
  fileDiffs: FileDiff[],
  ticketContext?: TicketContext,
  model?: string,
): Promise<NarrativeOutline> {
  const fileDescriptions = fileDiffs.map(buildFilePreview).join('\n\n');

  let ticketSection = '';
  if (ticketContext) {
    ticketSection = `\n\nThis work is for ticket **${ticketContext.id}: ${ticketContext.title}**.${ticketContext.description ? `\nTicket description: ${ticketContext.description.slice(0, 1500)}` : ''}\n\n`;
  }

  const text = await streamMessage(client, {
    model: model || DEFAULT_MODEL,
    max_tokens: 64_000,
    system: NARRATIVE_OUTLINE_PROMPT,
    messages: [{
      role: 'user',
      content: `${ticketSection}Organize these ${fileDiffs.length} changed files into a narrative structure:\n\n${fileDescriptions}`,
    }],
  });

  const parsed = parseJsonLenient(text) as {
    summary?: string;
    phases?: {
      title?: string;
      labels?: string[];
      description?: string;
      steps?: { id?: string; title?: string; files?: string[] }[];
    }[];
    ticketCorrelation?: {
      ticketId?: string;
      ticketTitle?: string;
      correlation?: string;
      resolution?: string;
    };
  };

  const allFiles = new Set(fileDiffs.map(f => f.file));

  const phases: OutlinePhase[] = (parsed.phases ?? []).map((p, pi) => ({
    title: p.title ?? `Phase ${pi + 1}`,
    labels: (p.labels ?? []).filter(l => typeof l === 'string' && l.trim()),
    description: p.description ?? '',
    steps: (p.steps ?? []).map((s, si) => ({
      id: s.id || `phase-${pi}-step-${si}`,
      title: s.title ?? `Step ${si + 1}`,
      files: (s.files ?? []).filter(f => allFiles.has(f)),
    })),
  }));

  // Ensure every file is assigned to at least one step
  const assignedFiles = new Set(phases.flatMap(p => p.steps.flatMap(s => s.files)));
  const unassigned = [...allFiles].filter(f => !assignedFiles.has(f));
  if (unassigned.length > 0) {
    phases.push({
      title: 'Other Changes',
      labels: [],
      description: 'Additional files that were modified',
      steps: unassigned.map((f, i) => ({
        id: `other-${i}`,
        title: f.split('/').pop() ?? f,
        files: [f],
      })),
    });
  }

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

  return { summary: parsed.summary ?? '', phases, ticketCorrelation };
}

// --- Stage 2: Per-phase details (parallel calls with full diffs) ---

async function getPhaseDetails(
  client: Anthropic,
  phase: OutlinePhase,
  fileDiffs: FileDiff[],
  fileHunksMap: Map<string, ParsedHunk[]>,
  allSteps: { id: string; title: string; phase: string }[],
  model?: string,
): Promise<NarrativeStep[]> {
  const phaseFileSet = new Set(phase.steps.flatMap(s => s.files));
  const phaseDiffs = fileDiffs.filter(fd => phaseFileSet.has(fd.file));

  // If no diffs, return outline steps with empty descriptions
  if (phaseDiffs.length === 0) {
    return phase.steps.map(s => ({
      id: s.id,
      title: s.title,
      description: '',
      files: s.files.map(f => ({
        file: f,
        diff: reassembleDiff(f, fileHunksMap.get(f) ?? []),
      })),
    }));
  }

  // Build content with numbered hunks
  const diffsContent = phaseDiffs.map(fd => {
    const hunks = fileHunksMap.get(fd.file) ?? [];
    if (hunks.length <= 1) {
      return `### ${fd.file} (1 hunk)\n\`\`\`diff\n${fd.diff.slice(0, 6000)}\n\`\`\``;
    }
    const labeled = hunks.map((h, i) => {
      const preview = h.lines.join('\n').slice(0, 3000);
      return `**Hunk ${i}:**\n\`\`\`diff\n${preview}\n\`\`\``;
    }).join('\n');
    return `### ${fd.file} (${hunks.length} hunks)\n${labeled}`;
  }).join('\n\n');

  const stepOutline = phase.steps
    .map(s => `- ${s.id}: "${s.title}" → ${s.files.join(', ')}`)
    .join('\n');

  const otherSteps = allSteps
    .filter(s => !phase.steps.some(ps => ps.id === s.id))
    .map(s => `${s.id} ("${s.title}", phase: ${s.phase})`)
    .join(', ');

  let text: string;
  try {
    text = await streamMessage(client, {
      model: model || DEFAULT_MODEL,
      max_tokens: 64_000,
      system: PHASE_DETAIL_PROMPT,
      messages: [{
        role: 'user',
        content: `Phase: "${phase.title}"\n\nStep outline:\n${stepOutline}\n\nOther steps for connections: ${otherSteps || 'none'}\n\nFull diffs:\n\n${diffsContent}`,
      }],
    });
  } catch {
    // On API failure, return outline steps with empty descriptions
    return phase.steps.map(s => ({
      id: s.id,
      title: s.title,
      description: '',
      files: s.files.map(f => ({
        file: f,
        diff: reassembleDiff(f, fileHunksMap.get(f) ?? []),
      })),
    }));
  }

  let parsed: {
    steps?: {
      id?: string;
      description?: string;
      files?: (string | { file: string; hunks?: number[] })[];
      connections?: string[];
    }[];
  };
  try {
    parsed = parseJsonLenient(text) as typeof parsed;
  } catch {
    // Fallback: outline steps without descriptions
    return phase.steps.map(s => ({
      id: s.id,
      title: s.title,
      description: '',
      files: s.files.map(f => ({
        file: f,
        diff: reassembleDiff(f, fileHunksMap.get(f) ?? []),
      })),
    }));
  }

  // Build a map of detail results by step ID
  const detailMap = new Map<string, {
    description?: string;
    files?: (string | { file: string; hunks?: number[] })[];
    connections?: string[];
  }>();
  for (const s of parsed.steps ?? []) {
    if (s.id) detailMap.set(s.id, s);
  }

  // Merge outline steps with detail results
  return phase.steps.map(outlineStep => {
    const detail = detailMap.get(outlineStep.id);

    const stepFiles = (detail?.files ?? outlineStep.files.map(f => f))
      .map(f => {
        const fileName = typeof f === 'string' ? f : f.file;
        const hunkIndices = typeof f === 'string' ? undefined : f.hunks;
        return { fileName, hunkIndices };
      })
      .filter(f => phaseFileSet.has(f.fileName))
      .map(({ fileName, hunkIndices }) => {
        const allHunks = fileHunksMap.get(fileName) ?? [];
        let diff: string;
        if (hunkIndices && hunkIndices.length > 0 && allHunks.length > 1) {
          const validIndices = hunkIndices.filter(i => i >= 0 && i < allHunks.length);
          diff = validIndices.length > 0
            ? reassembleDiff(fileName, validIndices.map(i => allHunks[i]))
            : reassembleDiff(fileName, allHunks);
        } else {
          diff = reassembleDiff(fileName, allHunks);
        }
        return { file: fileName, diff, hunkIndices };
      });

    // Ensure all outline files are present even if detail didn't reference them
    const detailFileSet = new Set(stepFiles.map(f => f.file));
    for (const f of outlineStep.files) {
      if (!detailFileSet.has(f)) {
        stepFiles.push({
          file: f,
          diff: reassembleDiff(f, fileHunksMap.get(f) ?? []),
          hunkIndices: undefined,
        });
      }
    }

    return {
      id: outlineStep.id,
      title: outlineStep.title,
      description: detail?.description ?? '',
      files: stepFiles,
      connections: detail?.connections,
    };
  });
}

// --- Main entry point: two-stage pipeline ---

export async function analyzeNarrative(
  apiKey: string,
  fileDiffs: FileDiff[],
  ticketContext?: TicketContext,
  model?: string,
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

  // Stage 1: Fast outline — abbreviated diffs, just structure + grouping
  const outline = await getNarrativeOutline(client, fileDiffs, ticketContext, model);

  // Build full step ID list for cross-phase connections
  const allSteps = outline.phases.flatMap(p =>
    p.steps.map(s => ({ id: s.id, title: s.title, phase: p.title }))
  );

  // Stage 2: Parallel detail calls — one per phase, full diffs
  const detailResults = await Promise.all(
    outline.phases.map(phase =>
      getPhaseDetails(client, phase, fileDiffs, fileHunksMap, allSteps, model)
    )
  );

  // Stage 3: Assemble final result
  const allStepIds = new Set(allSteps.map(s => s.id));

  const phases: NarrativePhase[] = outline.phases.map((op, i) => ({
    title: op.title,
    labels: op.labels,
    description: op.description,
    steps: detailResults[i],
  }));

  // Validate cross-phase connections
  for (const phase of phases) {
    for (const step of phase.steps) {
      if (step.connections) {
        step.connections = step.connections.filter(c => allStepIds.has(c) && c !== step.id);
        if (step.connections.length === 0) delete step.connections;
      }
    }
  }

  return {
    summary: outline.summary,
    phases,
    filesAnalyzed: fileDiffs.length,
    totalAdditions,
    totalDeletions,
    ticketCorrelation: outline.ticketCorrelation,
  };
}

export async function validateApiKey(key: string, model?: string): Promise<void> {
  const client = createClient(key);
  try {
    await client.messages.create({
      model: model || DEFAULT_MODEL,
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
