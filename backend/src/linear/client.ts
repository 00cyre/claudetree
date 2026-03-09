import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface ContentItem {
  type: string;
  text?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  priorityLabel: string;
  assignee?: string;
  labels: string[];
  url: string;
}

export interface LinearClientState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}

class LinearMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private _state: LinearClientState = { status: 'disconnected' };
  private connecting: Promise<void> | null = null;

  getStatus(): LinearClientState {
    return { ...this._state };
  }

  async connect(apiKey: string): Promise<void> {
    if (this.connecting) {
      await this.connecting.catch(() => {});
    }
    this.connecting = this._doConnect(apiKey);
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async _doConnect(apiKey: string): Promise<void> {
    await this.disconnect();

    this._state = { status: 'connecting' };

    try {
      this.transport = new StreamableHTTPClientTransport(new URL('https://mcp.linear.app/mcp'), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      });

      this.client = new Client(
        { name: 'claudetree', version: '0.1.0' },
        { capabilities: {} },
      );

      await this.client.connect(this.transport);

      // Probe to verify the connection works
      await this.client.listTools();

      this._state = { status: 'connected' };
    } catch (err) {
      this._state = { status: 'error', error: String(err) };
      await this.disconnect();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      // Ignore close errors
    }
    this.client = null;
    this.transport = null;
    if (this._state.status !== 'error') {
      this._state = { status: 'disconnected' };
    }
  }

  private ensureConnected(): Client {
    if (!this.client || this._state.status !== 'connected') {
      throw new Error('Linear MCP client is not connected');
    }
    return this.client;
  }

  async listTools(): Promise<{ name: string; description?: string }[]> {
    const client = this.ensureConnected();
    const result = await client.listTools();
    return (result.tools ?? []).map((t: { name: string; description?: string }) => ({
      name: t.name,
      description: t.description,
    }));
  }

  async getIssue(issueId: string): Promise<LinearIssue> {
    const client = this.ensureConnected();

    // Official Linear MCP uses `get_issue` with `id` param (accepts both UUID and identifier like ATL-4096)
    try {
      const result = await client.callTool({ name: 'get_issue', arguments: { id: issueId } });
      const issue = parseToolResult(result);
      if (issue) return issue;
    } catch {
      // Fall through to list_issues fallback
    }

    // Fallback: use list_issues with query filter
    try {
      const result = await client.callTool({
        name: 'list_issues',
        arguments: { query: issueId, limit: 5 },
      });
      const issues = parseSearchResult(result);
      const match = issues.find(
        (i) => i.identifier?.toUpperCase() === issueId.toUpperCase(),
      );
      if (match) return match;
    } catch {
      // Fall through
    }

    throw new Error('Failed to fetch issue from Linear MCP');
  }

  async searchIssues(query: string): Promise<LinearIssue[]> {
    const client = this.ensureConnected();
    const result = await client.callTool({
      name: 'list_issues',
      arguments: { query, limit: 20 },
    });
    return parseSearchResult(result);
  }
}

function parseToolResult(result: unknown): LinearIssue | null {
  const r = result as { content?: unknown[]; isError?: boolean; structuredContent?: unknown };
  if (r.isError) return null;

  let raw: Record<string, unknown> | null = null;

  // Try structuredContent first (newer MCP format)
  if (r.structuredContent && typeof r.structuredContent === 'object') {
    raw = r.structuredContent as Record<string, unknown>;
  } else {
    const content = r.content as ContentItem[] | undefined;
    const textContent = content?.find((c) => c.type === 'text');
    if (!textContent?.text) return null;
    try {
      raw = JSON.parse(textContent.text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (!raw || (!raw.id && !raw.identifier && !raw.title && !(raw as { issue?: unknown }).issue))
    return null;
  // Some MCP servers wrap the issue in { issue: {...} }
  const data = (raw as { issue?: Record<string, unknown> }).issue ?? raw;
  return normalizeIssue(data as Record<string, unknown>);
}

function parseSearchResult(result: unknown): LinearIssue[] {
  const r = result as { content?: unknown[]; isError?: boolean };
  if (r.isError) return [];
  const content = r.content as ContentItem[] | undefined;
  const textContent = content?.find((c) => c.type === 'text');
  if (!textContent?.text) return [];
  try {
    const raw = JSON.parse(textContent.text) as unknown;
    const list = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).issues ?? (raw as Record<string, unknown>).nodes ?? [raw];
    const items = Array.isArray(list) ? list : [list];
    return (items as Record<string, unknown>[])
      .map((item) => {
        const data = (item as { issue?: Record<string, unknown> }).issue ?? item;
        if (!data || (!(data as Record<string, unknown>).id && !(data as Record<string, unknown>).title)) return null;
        return normalizeIssue(data as Record<string, unknown>);
      })
      .filter((i): i is LinearIssue => i !== null);
  } catch {
    return [];
  }
}


function normalizeIssue(raw: Record<string, unknown>): LinearIssue {
  // Official Linear MCP returns priority as { value: number, name: string }
  const priorityObj = raw.priority as { value?: number; name?: string } | number | undefined;
  let priorityValue: number;
  let priorityLabel: string;
  if (typeof priorityObj === 'object' && priorityObj !== null) {
    priorityValue = priorityObj.value ?? 0;
    priorityLabel = priorityObj.name ?? getPriorityLabel(priorityValue);
  } else {
    priorityValue = Number(priorityObj ?? 0);
    priorityLabel = String(raw.priorityLabel ?? getPriorityLabel(priorityValue));
  }

  // Status can be a string or { name: string } or nested in state
  const stateRaw = raw.state as Record<string, unknown> | string | undefined;
  const statusRaw = raw.status as Record<string, unknown> | string | undefined;
  let status: string;
  if (typeof stateRaw === 'object' && stateRaw?.name) {
    status = String(stateRaw.name);
  } else if (typeof statusRaw === 'object' && statusRaw?.name) {
    status = String(statusRaw.name);
  } else {
    status = String(stateRaw ?? statusRaw ?? raw.stateName ?? 'Unknown');
  }

  return {
    id: String(raw.id ?? ''),
    identifier: String(raw.identifier ?? raw.id ?? ''),
    title: String(raw.title ?? ''),
    description: raw.description != null ? String(raw.description) : undefined,
    status,
    priority: priorityValue,
    priorityLabel,
    assignee: raw.assignee
      ? String((raw.assignee as Record<string, unknown>).name ?? raw.assignee)
      : undefined,
    labels: normalizeLabels(raw.labels),
    url: String(raw.url ?? ''),
  };
}

function normalizeLabels(labels: unknown): string[] {
  if (!labels) return [];
  if (Array.isArray(labels)) {
    return labels.map((l) =>
      typeof l === 'string' ? l : String((l as Record<string, unknown>).name ?? l),
    );
  }
  if (typeof labels === 'object' && labels !== null && 'nodes' in labels) {
    return normalizeLabels((labels as { nodes: unknown }).nodes);
  }
  return [];
}

function getPriorityLabel(priority: number): string {
  const map: Record<number, string> = {
    0: 'No priority',
    1: 'Urgent',
    2: 'High',
    3: 'Medium',
    4: 'Low',
  };
  return map[priority] ?? 'Unknown';
}

export const linearClient = new LinearMcpClient();
