import type { Project, Worktree, DiffResult, FileDiff } from '../types/index.js';

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
};
