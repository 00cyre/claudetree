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
  additions: number;
  deletions: number;
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
  createdBy?: string;
  project?: string;
  projectMilestone?: string;
  team?: string;
  createdAt?: string;
  updatedAt?: string;
  dueDate?: string;
  attachments?: LinearAttachment[];
}

export interface LinearAttachment {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: string;
}

export interface LinearStatus {
  configured: boolean;
  connected: boolean;
  status: string;
  error?: string;
}

export interface AIStatus {
  configured: boolean;
  connected: boolean;
}

export interface FileAnalysis {
  sortOrder: string[];
  explanations: Record<string, string>;
  summary: string;
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

export type Tab = 'features' | 'review';
