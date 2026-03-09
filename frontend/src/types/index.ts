export interface Project {
  id: string;
  name: string;
  path: string;
  worktreeBase: string;
}

export interface Worktree {
  id: string;
  name: string;
  path: string;
  branch: string;
  projectId: string;
  linearIssueId?: string;
}

export interface ChangedFile {
  file: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
}

export interface DiffResult {
  branch: string;
  files: ChangedFile[];
}

export interface FileDiff {
  file: string;
  diff: string;
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

export interface LinearStatus {
  configured: boolean;
  connected: boolean;
  status: string;
  error?: string;
}

export type Tab = 'features' | 'review';
