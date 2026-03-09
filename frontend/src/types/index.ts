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

export type Tab = 'features' | 'review';
