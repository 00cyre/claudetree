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

export type DevStep = 'dev' | 'review' | 'pr' | 'merged';

export interface PRReviewer {
  login: string;
  name: string;
  avatarUrl: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED';
}

export interface PRCheck {
  name: string;
  status: string;
  conclusion: string;
  detailsUrl?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PRCommentDetail {
  id: string;
  body: string;
  author: { login: string; name?: string; avatarUrl?: string };
  createdAt: string;
  path?: string;
  line?: number;
  diffHunk?: string;
  reviewState?: string;
}

export interface PRDetailedData {
  number: number;
  url: string;
  title: string;
  state: string;
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviews: PRReviewer[];
  checks: PRCheck[];
  comments: PRCommentDetail[];
  approvalCount: number;
  commitCount: number;
}

export type PipelinePhase =
  | 'idle'
  | 'watching'
  | 'passing'
  | 'failing'
  | 'fixing'
  | 'error';

export interface PipelineStatus {
  phase: PipelinePhase;
  message: string;
  since: number;
  failedChecks?: string[];
  fixAttempt?: number;
  maxAttempts: number;
  autofixSessionId?: string;
}

export type PRNotificationType =
  | 'ci_failed'
  | 'ci_passed'
  | 'autofix_started'
  | 'autofix_pushed'
  | 'autofix_failed'
  | 'new_comment'
  | 'new_review'
  | 'pr_closed'
  | 'pr_merged';

export interface PRNotification {
  id: string;
  type: PRNotificationType;
  message: string;
  timestamp: number;
  dismissed: boolean;
  meta?: Record<string, unknown>;
}

export type AttentionColor = 'amber' | 'emerald';
export interface AttentionState {
  color: AttentionColor;
  reason: string;
  timestamp: number;
}

export type PRWatcherPhase =
  | 'discovering'
  | 'watching'
  | 'ci_failing'
  | 'fixing'
  | 'pushing_fix'
  | 'no_pr'
  | 'stopped'
  | 'error';

export type PRReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'CHANGES_ADDRESSED' | 'REVIEW_REQUIRED';
export type PRCIStatus = 'passing' | 'failing' | 'pending';

export interface PRMergedMeta {
  mergedBy: string;
  mergedAt: string;
  baseBranch: string;
  commitCount: number;
}

export interface PRWatcherStatus {
  phase: PRWatcherPhase;
  message: string;
  since: number;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  fixAttempt: number;
  maxAttempts: number;
  notifications: PRNotification[];
  reviewDecision?: PRReviewDecision;
  ciStatus?: PRCIStatus;
}
