import Anthropic from '@anthropic-ai/sdk';

export interface AnalysisResult {
  sortOrder: string[];
  explanations: Record<string, string>;
  summary: string;
}

interface FileDiff {
  file: string;
  diff: string;
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

Return ONLY valid JSON with this exact structure:
{
  "sortOrder": ["file1.ts", "file2.ts", ...],
  "explanations": {
    "file1.ts": "explanation of changes",
    "file2.ts": "explanation of changes"
  },
  "summary": "overall summary of all changes"
}`;

export async function analyzeChanges(
  apiKey: string,
  fileDiffs: FileDiff[],
): Promise<AnalysisResult> {
  if (fileDiffs.length === 0) {
    return { sortOrder: [], explanations: {}, summary: 'No changes.' };
  }

  const client = createClient(apiKey);

  const userContent = fileDiffs
    .map((fd) => `### ${fd.file}\n\`\`\`diff\n${fd.diff.slice(0, 4000)}\n\`\`\``)
    .join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyze these ${fileDiffs.length} changed files:\n\n${userContent}`,
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

  return {
    sortOrder,
    explanations: parsed.explanations ?? {},
    summary: parsed.summary ?? '',
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
): Promise<FileDetailedAnalysis> {
  if (!diff.trim()) {
    return { file, overview: 'No changes.', steps: [] };
  }

  const client = createClient(apiKey);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: FILE_ANALYSIS_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyze this diff for \`${file}\`:\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``,
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
