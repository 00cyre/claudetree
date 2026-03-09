import type { Project, Worktree, DiffResult, FileDiff, LinearIssue, LinearComment, LinearStatus, AIStatus, FileAnalysis } from '../types/index.js';

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

  createWorktree: (projectId: string, name: string) =>
    request<Worktree>(`/worktrees/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
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

  analyzeChanges: (worktreeId: string) =>
    request<FileAnalysis>(`/diff/${worktreeId}/analyze`, { method: 'POST' }),
};
