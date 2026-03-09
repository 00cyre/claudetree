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
