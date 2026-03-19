import type { Project, Worktree, DiffResult, FileDiff, LinearIssue, LinearComment, LinearStatus, AIStatus, FileAnalysis, FileDetailedAnalysis, TicketContext, PipelineStatus, PRWatcherStatus, BranchDiffResult, NarrativeAnalysis, Flag, Folder, PRDetailedData } from '../types/index.js';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getProjects: () => request<Project[]>('/projects'),

  addProject: (path: string) =>
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  getWorktrees: (projectId: string) =>
    request<Worktree[]>(`/worktrees/${projectId}`),

  getBranches: (projectId: string) =>
    request<string[]>(`/worktrees/${projectId}/branches`),

  createWorktree: (projectId: string, name: string, baseBranch?: string) =>
    request<Worktree>(`/worktrees/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ name, baseBranch }),
    }),

  deleteWorktree: (id: string) =>
    request<{ ok: boolean }>(`/worktrees/${id}`, { method: 'DELETE' }),

  getDiff: (worktreeId: string) =>
    request<DiffResult>(`/diff/${worktreeId}`),

  getFileDiff: (worktreeId: string, file: string) =>
    request<FileDiff>(`/diff/${worktreeId}/${file}`),

  commit: (worktreeId: string, message: string, files?: string[]) =>
    request<{ ok: boolean; summary: unknown }>(`/commit/${worktreeId}`, {
      method: 'POST',
      body: JSON.stringify({ message, files }),
    }),

  getLinearStatus: () =>
    request<LinearStatus>('/linear/status'),

  setupLinear: (apiKey: string) =>
    request<{ ok: boolean }>('/linear/setup', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),

  getLinearIssue: (issueId: string) =>
    request<LinearIssue>(`/linear/issues/${issueId}`),

  getLinearComments: (issueId: string) =>
    request<LinearComment[]>(`/linear/issues/${issueId}/comments`),

  linkWorktree: (projectId: string, worktreeId: string, linearIssueId: string) =>
    request<{ ok: boolean }>(`/worktrees/${projectId}/${worktreeId}/link`, {
      method: 'POST',
      body: JSON.stringify({ linearIssueId }),
    }),

  unlinkWorktree: (projectId: string, worktreeId: string) =>
    request<{ ok: boolean }>(`/worktrees/${projectId}/${worktreeId}/link`, {
      method: 'DELETE',
    }),

  getAIStatus: () =>
    request<AIStatus>('/ai/status'),

  setupAI: (apiKey: string) =>
    request<{ ok: boolean }>('/ai/setup', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),

  analyzeChanges: (worktreeId: string, ticketContext?: TicketContext) =>
    request<FileAnalysis>(`/diff/${worktreeId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ ticketContext }),
    }),

  analyzeFile: (worktreeId: string, file: string, ticketContext?: TicketContext) =>
    request<FileDetailedAnalysis>(`/diff/${worktreeId}/${encodeURIComponent(file)}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ ticketContext }),
    }),

  getBranchDiff: (worktreeId: string, baseBranch: string) =>
    request<BranchDiffResult>(`/diff/${worktreeId}?scope=branch&base=${encodeURIComponent(baseBranch)}`),

  analyzeNarrative: (worktreeId: string, baseBranch: string, ticketContext?: TicketContext, fingerprint?: string) =>
    request<NarrativeAnalysis>(`/diff/${worktreeId}/narrative`, {
      method: 'POST',
      body: JSON.stringify({ baseBranch, ticketContext, fingerprint }),
    }),

  enablePipeline: (worktreeId: string) =>
    request<{ status: PipelineStatus }>(`/pipeline/${worktreeId}/enable`, { method: 'POST' }),

  disablePipeline: (worktreeId: string) =>
    request<{ ok: boolean }>(`/pipeline/${worktreeId}/disable`, { method: 'POST' }),

  sendTerminalCommand: (worktreeId: string, text: string) =>
    request<{ ok: boolean }>(`/terminal/${worktreeId}/write`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // Worktree order
  setWorktreeOrder: (projectId: string, order: string[]) =>
    request<{ ok: boolean }>(`/worktrees/${projectId}/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  // Worktree flags
  setWorktreeFlags: (worktreeId: string, flags: string[]) =>
    request<{ ok: boolean }>(`/worktrees/${worktreeId}/flags`, {
      method: 'PUT',
      body: JSON.stringify({ flags }),
    }),

  // Flag definitions
  getFlags: () => request<Flag[]>('/worktrees/meta/flags'),

  createFlag: (name: string, color: string) =>
    request<{ ok: boolean }>('/worktrees/meta/flags', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  deleteFlag: (name: string) =>
    request<{ ok: boolean }>(`/worktrees/meta/flags/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  // Folders
  getFolders: (projectId: string) =>
    request<Folder[]>(`/worktrees/${projectId}/folders`),

  createFolder: (projectId: string, name: string) =>
    request<Folder>(`/worktrees/${projectId}/folders`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateFolder: (projectId: string, folderId: string, name: string) =>
    request<{ ok: boolean }>(`/worktrees/${projectId}/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),

  deleteFolder: (projectId: string, folderId: string) =>
    request<{ ok: boolean }>(`/worktrees/${projectId}/folders/${folderId}`, {
      method: 'DELETE',
    }),

  setFolderOrder: (projectId: string, order: string[]) =>
    request<{ ok: boolean }>(`/worktrees/${projectId}/folders/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  setWorktreeFolder: (worktreeId: string, folderId: string | null) =>
    request<{ ok: boolean }>(`/worktrees/${worktreeId}/folder`, {
      method: 'PUT',
      body: JSON.stringify({ folderId }),
    }),

  // PR Watcher
  getPRWatcherStatus: (worktreeId: string) =>
    request<PRWatcherStatus | null>(`/pr-watcher/${worktreeId}`),

  dismissPRNotification: (worktreeId: string, notificationId: string) =>
    request<{ ok: boolean }>(`/pr-watcher/${worktreeId}/dismiss/${notificationId}`, {
      method: 'POST',
    }),

  getPRDetails: (worktreeId: string) =>
    request<PRDetailedData>(`/pr-watcher/${worktreeId}/details`),

  postPRComment: (worktreeId: string, body: string, replyToCommentId?: string) =>
    request<{ ok: boolean }>(`/pr-watcher/${worktreeId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body, replyToCommentId }),
    }),
};
