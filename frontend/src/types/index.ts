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
  description?: string;
  flags?: string[];
}

export interface Flag {
  name: string;
  color: string;
}

export type ClaudeActivityState = 'booting' | 'active' | 'idle' | 'exited' | 'error';

export interface SessionStatus {
  state: ClaudeActivityState;
  lastActivity: number;
  stateStartedAt: number;
  description?: string;
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
  fileGroups?: Record<string, string[]>;
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

export interface TicketContext {
  id: string;
  title: string;
  description?: string;
}

// Narrative analysis types for unified review view
export interface NarrativeStep {
  id: string;
  title: string;
  description: string;
  files: {
    file: string;
    diff: string;
    hunkIndices?: number[];
  }[];
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
  correlation: string;
  resolution: string;
}

export interface NarrativeAnalysis {
  summary: string;
  phases: NarrativePhase[];
  filesAnalyzed: number;
  totalAdditions: number;
  totalDeletions: number;
  ticketCorrelation?: TicketCorrelation;
  fingerprint?: string;
  cached?: boolean;
}

export interface BranchDiffResult {
  baseBranch: string;
  files: ChangedFile[];
  fileDiffs: Record<string, string>;
}

export type Tab = 'features' | 'review';

export type PipelinePhase =
  | 'idle'
  | 'pushing'
  | 'waiting'
  | 'passing'
  | 'failing'
  | 'fixing'
  | 'confirming'
  | 'error';

export interface PipelineStatus {
  phase: PipelinePhase;
  message: string;
  since: number;
  failedChecks?: string[];
  fixAttempt?: number;
  maxAttempts: number;
}
