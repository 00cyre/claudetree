import type {
  Project,
  Worktree,
  LinearIssue,
  LinearComment,
  LinearStatus,
  AIStatus,
  Flag,
  PRDetailedData,
  NarrativeAnalysis,
  BranchDiffResult,
  PRWatcherStatus,
  PipelineStatus,
  SessionStatus,
} from '@/types';

// ── Project & Worktree ──────────────────────────────────────────────

export const DEMO_PROJECT: Project = {
  id: 'demo-project-1',
  name: 'claudetree',
  path: '/Volumes/zx1/claudetree',
  worktreeBase: '/Volumes/zx1/claudetree/.worktrees',
};

export const DEMO_WORKTREE: Worktree = {
  id: 'demo-wt-redis',
  name: 'redis-cache-server',
  path: '/Volumes/zx1/claudetree/.worktrees/redis-cache-server',
  branch: 'feat/ENG-847-redis-cache-server',
  projectId: 'demo-project-1',
  linearIssueId: 'ENG-847',
  flags: ['backend', 'performance'],
};

export const DEMO_WORKTREES_EXISTING: Worktree[] = [
  {
    id: 'demo-wt-auth',
    name: 'auth-middleware-v2',
    path: '/Volumes/zx1/claudetree/.worktrees/auth-middleware-v2',
    branch: 'feat/ENG-812-auth-middleware-v2',
    projectId: 'demo-project-1',
    linearIssueId: 'ENG-812',
    flags: ['security'],
  },
  {
    id: 'demo-wt-dashboard',
    name: 'analytics-dashboard',
    path: '/Volumes/zx1/claudetree/.worktrees/analytics-dashboard',
    branch: 'feat/ENG-831-analytics-dashboard',
    projectId: 'demo-project-1',
    linearIssueId: 'ENG-831',
    flags: ['frontend'],
  },
];

// ── Linear Issue ────────────────────────────────────────────────────

export const DEMO_LINEAR_STATUS: LinearStatus = {
  configured: true,
  connected: true,
  status: 'connected',
};

export const DEMO_AI_STATUS: AIStatus = {
  configured: true,
  connected: true,
};

export const DEMO_ISSUE: LinearIssue = {
  id: 'issue-eng-847',
  identifier: 'ENG-847',
  title: 'Implement Redis Cache Server',
  description: `## Overview

Implement a Redis caching layer for the platform API to reduce database load and improve response times for frequently accessed data.

## Requirements

- Set up Redis connection with connection pooling (max 10 connections)
- Implement **cache-aside pattern** for user profiles and session data
- Add TTL-based expiration:
  - User profiles: 5 minutes
  - Session data: 30 minutes
  - API responses: 2 minutes
- Create cache invalidation hooks on data mutations
- Add health check endpoint for Redis connectivity
- Monitor cache hit/miss ratio via Prometheus metrics

## Technical Notes

- Use \`ioredis\` client library for cluster support
- Configuration via environment variables: \`REDIS_HOST\`, \`REDIS_PORT\`, \`REDIS_PASSWORD\`
- Implement graceful fallback to database when Redis is unavailable
- Add unit tests for cache service and integration tests for invalidation

\`\`\`typescript
// Example cache configuration
const cacheConfig = {
  profiles: { ttl: 300, prefix: 'usr:' },
  sessions: { ttl: 1800, prefix: 'ses:' },
  apiResponses: { ttl: 120, prefix: 'api:' },
};
\`\`\`

## Acceptance Criteria

- [ ] Cache hit rate > 80% for read-heavy endpoints
- [ ] P95 latency reduced by at least 40%
- [ ] Zero downtime when Redis is unavailable (fallback to DB)
- [ ] All existing tests pass
- [ ] Cache invalidation works correctly on mutations`,
  status: 'In Progress',
  priority: 2,
  priorityLabel: 'High',
  assignee: 'Alex Chen',
  labels: ['backend', 'performance', 'infrastructure'],
  url: 'https://linear.app/platform/issue/ENG-847',
  createdBy: 'Sarah Kim',
  project: 'Platform Services',
  projectMilestone: 'Q1 Performance',
  team: 'Backend',
  createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
};

export const DEMO_COMMENTS: LinearComment[] = [
  {
    id: 'comment-1',
    body: `Let's prioritize the connection pooling — we saw connection exhaustion on staging last week when the auth service hammered the DB without pooling.\n\nAlso consider using \`ioredis\` Cluster mode from the start, even if we're running a single instance. Saves us a migration later.`,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    author: 'Sarah Kim',
  },
  {
    id: 'comment-2',
    body: `Talked to the infra team — they've already provisioned a Redis 7.2 cluster on \`redis.internal:6379\`. We have read replicas available too.\n\nFor the health check, can you expose it on \`GET /health/redis\` so it plays nice with our existing K8s probes?`,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    author: 'Mike Rodriguez',
  },
];

// ── Flags ───────────────────────────────────────────────────────────

export const DEMO_FLAGS: Flag[] = [
  { name: 'backend', color: '#6366f1' },
  { name: 'frontend', color: '#f59e0b' },
  { name: 'performance', color: '#10b981' },
  { name: 'security', color: '#ef4444' },
  { name: 'infra', color: '#8b5cf6' },
];

// ── PR Details ──────────────────────────────────────────────────────

const now = Date.now();

export const DEMO_PR_DETAILS: PRDetailedData = {
  number: 142,
  url: 'https://github.com/platform-eng/claudetree/pull/142',
  title: 'feat: implement Redis cache server with connection pooling',
  state: 'OPEN',
  baseRefName: 'staging',
  headRefName: 'feat/ENG-847-redis-cache-server',
  additions: 487,
  deletions: 23,
  changedFiles: 12,
  reviews: [
    {
      login: 'sarahkim',
      name: 'Sarah Kim',
      avatarUrl: '',
      state: 'APPROVED',
    },
    {
      login: 'mikerodriguez',
      name: 'Mike Rodriguez',
      avatarUrl: '',
      state: 'COMMENTED',
    },
  ],
  checks: [
    {
      name: 'Build & Typecheck',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      startedAt: new Date(now - 180_000).toISOString(),
      completedAt: new Date(now - 120_000).toISOString(),
    },
    {
      name: 'Unit Tests',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      startedAt: new Date(now - 180_000).toISOString(),
      completedAt: new Date(now - 90_000).toISOString(),
    },
    {
      name: 'Integration Tests',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      startedAt: new Date(now - 180_000).toISOString(),
      completedAt: new Date(now - 45_000).toISOString(),
    },
    {
      name: 'Lint & Format',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      startedAt: new Date(now - 180_000).toISOString(),
      completedAt: new Date(now - 150_000).toISOString(),
    },
  ],
  comments: [
    {
      id: 'pr-c1',
      body: 'Clean implementation! The connection pooling logic looks solid. One suggestion: consider adding a `maxRetriesPerRequest` config option so we can tune retry behavior per environment.',
      author: { login: 'sarahkim', name: 'Sarah Kim' },
      createdAt: new Date(now - 3600_000).toISOString(),
      path: 'src/cache/redis-client.ts',
      line: 42,
      diffHunk: `@@ -38,6 +38,12 @@ export class RedisClient {
   private pool: IORedis.Cluster;
   private config: RedisConfig;

+  constructor(config: RedisConfig) {
+    this.config = config;
+    this.pool = new IORedis.Cluster(config.nodes, {
+      maxRetriesPerRequest: 3,
+      retryDelayOnFailover: 100,
+    });
+  }`,
      reviewState: 'APPROVED',
    },
    {
      id: 'pr-c2',
      body: 'Should we add a circuit breaker here? If Redis is down, we don\'t want every request to wait for the connection timeout before falling back to DB.\n\n```typescript\nif (this.circuitOpen) {\n  return this.fallbackToDb(key);\n}\n```',
      author: { login: 'mikerodriguez', name: 'Mike Rodriguez' },
      createdAt: new Date(now - 1800_000).toISOString(),
      path: 'src/cache/cache-service.ts',
      line: 67,
      diffHunk: `@@ -60,8 +60,15 @@ export class CacheService {
   async get<T>(key: string): Promise<T | null> {
     try {
       const cached = await this.client.get(this.prefixed(key));
+      if (!cached) {
+        this.metrics.miss(key);
+        return null;
+      }
+      this.metrics.hit(key);
       return cached ? JSON.parse(cached) : null;
     } catch (err) {
+      this.logger.warn('Cache read failed, falling back to DB', { key, err });
       return null;
     }
   }`,
      reviewState: 'COMMENTED',
    },
    {
      id: 'pr-c3',
      body: 'The TTL values look good. Nice job adding the per-category configuration — much better than a global TTL.',
      author: { login: 'sarahkim', name: 'Sarah Kim' },
      createdAt: new Date(now - 900_000).toISOString(),
      reviewState: 'APPROVED',
    },
  ],
  approvalCount: 1,
  commitCount: 4,
};

// ── Narrative Analysis (Review) ─────────────────────────────────────

export const DEMO_NARRATIVE: NarrativeAnalysis = {
  summary: 'Implements a Redis caching layer with connection pooling, cache-aside pattern, and TTL-based expiration. Includes health check endpoint and graceful DB fallback.',
  phases: [
    {
      title: 'Redis Client & Configuration',
      labels: ['infrastructure', 'setup'],
      description: 'Set up the Redis client with connection pooling and environment-based configuration.',
      steps: [
        {
          id: 'step-1',
          title: 'Redis configuration module',
          description: 'Created environment-variable-based configuration for Redis connection parameters with sensible defaults.',
          files: [
            {
              file: 'src/config/redis.ts',
              diff: `--- a/src/config/redis.ts
+++ b/src/config/redis.ts
@@ -0,0 +1,28 @@
+export interface RedisConfig {
+  host: string;
+  port: number;
+  password?: string;
+  maxConnections: number;
+  connectTimeout: number;
+}
+
+export function loadRedisConfig(): RedisConfig {
+  return {
+    host: process.env.REDIS_HOST || 'localhost',
+    port: parseInt(process.env.REDIS_PORT || '6379', 10),
+    password: process.env.REDIS_PASSWORD,
+    maxConnections: parseInt(process.env.REDIS_MAX_CONNECTIONS || '10', 10),
+    connectTimeout: 5000,
+  };
+}`,
            },
          ],
        },
        {
          id: 'step-2',
          title: 'Redis client with connection pooling',
          description: 'Implemented the Redis client using ioredis with connection pooling (max 10 connections) and automatic reconnection.',
          files: [
            {
              file: 'src/cache/redis-client.ts',
              diff: `--- a/src/cache/redis-client.ts
+++ b/src/cache/redis-client.ts
@@ -0,0 +1,65 @@
+import IORedis from 'ioredis';
+import { RedisConfig } from '../config/redis';
+import { logger } from '../utils/logger';
+
+export class RedisClient {
+  private client: IORedis;
+  private connected = false;
+
+  constructor(private config: RedisConfig) {
+    this.client = new IORedis({
+      host: config.host,
+      port: config.port,
+      password: config.password,
+      maxRetriesPerRequest: 3,
+      retryStrategy: (times) => Math.min(times * 200, 2000),
+      lazyConnect: true,
+    });
+
+    this.client.on('connect', () => {
+      this.connected = true;
+      logger.info('Redis connected');
+    });
+
+    this.client.on('error', (err) => {
+      logger.error('Redis error', { error: err.message });
+    });
+  }
+
+  async connect(): Promise<void> {
+    await this.client.connect();
+  }
+
+  async get(key: string): Promise<string | null> {
+    return this.client.get(key);
+  }
+
+  async set(key: string, value: string, ttl?: number): Promise<void> {
+    if (ttl) {
+      await this.client.setex(key, ttl, value);
+    } else {
+      await this.client.set(key, value);
+    }
+  }
+
+  async del(key: string): Promise<void> {
+    await this.client.del(key);
+  }
+
+  async isHealthy(): Promise<boolean> {
+    try {
+      const pong = await this.client.ping();
+      return pong === 'PONG';
+    } catch {
+      return false;
+    }
+  }
+}`,
            },
          ],
        },
      ],
    },
    {
      title: 'Cache Service & Patterns',
      labels: ['core', 'cache-aside'],
      description: 'Implemented the cache-aside pattern with per-category TTL configuration and metrics tracking.',
      steps: [
        {
          id: 'step-3',
          title: 'Cache service with TTL categories',
          description: 'Created the main cache service implementing cache-aside pattern with configurable TTL per data category.',
          files: [
            {
              file: 'src/cache/cache-service.ts',
              diff: `--- a/src/cache/cache-service.ts
+++ b/src/cache/cache-service.ts
@@ -0,0 +1,82 @@
+import { RedisClient } from './redis-client';
+import { logger } from '../utils/logger';
+
+interface CacheCategory {
+  ttl: number;
+  prefix: string;
+}
+
+const CATEGORIES: Record<string, CacheCategory> = {
+  profiles: { ttl: 300, prefix: 'usr:' },
+  sessions: { ttl: 1800, prefix: 'ses:' },
+  apiResponses: { ttl: 120, prefix: 'api:' },
+};
+
+export class CacheService {
+  private hits = 0;
+  private misses = 0;
+
+  constructor(private client: RedisClient) {}
+
+  async get<T>(category: string, key: string): Promise<T | null> {
+    const cat = CATEGORIES[category];
+    if (!cat) return null;
+
+    try {
+      const raw = await this.client.get(cat.prefix + key);
+      if (!raw) {
+        this.misses++;
+        return null;
+      }
+      this.hits++;
+      return JSON.parse(raw);
+    } catch (err) {
+      logger.warn('Cache read failed', { category, key, err });
+      return null;
+    }
+  }
+
+  async set<T>(category: string, key: string, value: T): Promise<void> {
+    const cat = CATEGORIES[category];
+    if (!cat) return;
+
+    try {
+      await this.client.set(cat.prefix + key, JSON.stringify(value), cat.ttl);
+    } catch (err) {
+      logger.warn('Cache write failed', { category, key, err });
+    }
+  }
+
+  async invalidate(category: string, key: string): Promise<void> {
+    const cat = CATEGORIES[category];
+    if (!cat) return;
+    await this.client.del(cat.prefix + key);
+  }
+
+  getStats() {
+    const total = this.hits + this.misses;
+    return {
+      hits: this.hits,
+      misses: this.misses,
+      hitRate: total > 0 ? this.hits / total : 0,
+    };
+  }
+}`,
            },
          ],
        },
        {
          id: 'step-4',
          title: 'Cache invalidation middleware',
          description: 'Added Express middleware that automatically invalidates cached data when mutations occur.',
          files: [
            {
              file: 'src/cache/cache-middleware.ts',
              diff: `--- a/src/cache/cache-middleware.ts
+++ b/src/cache/cache-middleware.ts
@@ -0,0 +1,34 @@
+import { Request, Response, NextFunction } from 'express';
+import { CacheService } from './cache-service';
+
+export function cacheInvalidation(cache: CacheService) {
+  return (req: Request, res: Response, next: NextFunction) => {
+    if (req.method === 'GET') return next();
+
+    const originalEnd = res.end;
+    res.end = function (...args: Parameters<typeof originalEnd>) {
+      if (res.statusCode >= 200 && res.statusCode < 300) {
+        const userId = req.params.userId || req.body?.userId;
+        if (userId) {
+          cache.invalidate('profiles', userId).catch(() => {});
+          cache.invalidate('sessions', userId).catch(() => {});
+        }
+      }
+      return originalEnd.apply(this, args);
+    };
+
+    next();
+  };
+}`,
            },
          ],
        },
      ],
    },
    {
      title: 'Health Check & Tests',
      labels: ['testing', 'observability'],
      description: 'Added Redis health check endpoint and comprehensive test coverage.',
      steps: [
        {
          id: 'step-5',
          title: 'Health check endpoint',
          description: 'Added a GET /health/redis endpoint that checks Redis connectivity.',
          files: [
            {
              file: 'src/routes/health.ts',
              diff: `--- a/src/routes/health.ts
+++ b/src/routes/health.ts
@@ -12,6 +12,18 @@ router.get('/health', (req, res) => {
   res.json({ status: 'ok' });
 });

+router.get('/health/redis', async (req, res) => {
+  try {
+    const healthy = await redisClient.isHealthy();
+    if (healthy) {
+      const stats = cacheService.getStats();
+      res.json({ status: 'ok', ...stats });
+    } else {
+      res.status(503).json({ status: 'degraded', message: 'Redis not responding' });
+    }
+  } catch {
+    res.status(503).json({ status: 'error', message: 'Redis unreachable' });
+  }
+});`,
            },
          ],
        },
        {
          id: 'step-6',
          title: 'Unit and integration tests',
          description: 'Added tests for Redis client, cache service, and invalidation middleware.',
          files: [
            {
              file: 'tests/cache/cache-service.test.ts',
              diff: `--- a/tests/cache/cache-service.test.ts
+++ b/tests/cache/cache-service.test.ts
@@ -0,0 +1,48 @@
+import { CacheService } from '../../src/cache/cache-service';
+import { RedisClient } from '../../src/cache/redis-client';
+
+describe('CacheService', () => {
+  let client: RedisClient;
+  let service: CacheService;
+
+  beforeAll(async () => {
+    client = new RedisClient(testConfig);
+    await client.connect();
+    service = new CacheService(client);
+  });
+
+  it('should cache and retrieve profiles', async () => {
+    const profile = { name: 'Alex', role: 'admin' };
+    await service.set('profiles', 'user-1', profile);
+    const cached = await service.get('profiles', 'user-1');
+    expect(cached).toEqual(profile);
+  });
+
+  it('should track hit/miss stats', async () => {
+    await service.get('profiles', 'nonexistent');
+    const stats = service.getStats();
+    expect(stats.misses).toBeGreaterThan(0);
+  });
+
+  it('should invalidate correctly', async () => {
+    await service.set('profiles', 'user-2', { name: 'B' });
+    await service.invalidate('profiles', 'user-2');
+    const result = await service.get('profiles', 'user-2');
+    expect(result).toBeNull();
+  });
+});`,
            },
          ],
        },
      ],
    },
  ],
  filesAnalyzed: 12,
  totalAdditions: 487,
  totalDeletions: 23,
  ticketCorrelation: {
    ticketId: 'ENG-847',
    ticketTitle: 'Implement Redis Cache Server',
    correlation: 'Direct implementation of all acceptance criteria specified in the ticket.',
    resolution: 'All requirements addressed: connection pooling, cache-aside pattern, TTL configuration, invalidation hooks, health check, and test coverage.',
  },
  fingerprint: 'demo-narrative-001',
  cached: false,
};

// ── Branch Diff ─────────────────────────────────────────────────────

export const DEMO_BRANCH_DIFF: BranchDiffResult = {
  baseBranch: 'staging',
  files: [
    { file: 'src/config/redis.ts', status: 'added', additions: 28, deletions: 0 },
    { file: 'src/cache/redis-client.ts', status: 'added', additions: 65, deletions: 0 },
    { file: 'src/cache/cache-service.ts', status: 'added', additions: 82, deletions: 0 },
    { file: 'src/cache/cache-middleware.ts', status: 'added', additions: 34, deletions: 0 },
    { file: 'src/routes/health.ts', status: 'modified', additions: 18, deletions: 0 },
    { file: 'src/index.ts', status: 'modified', additions: 12, deletions: 3 },
    { file: 'package.json', status: 'modified', additions: 2, deletions: 0 },
    { file: 'tests/cache/redis-client.test.ts', status: 'added', additions: 56, deletions: 0 },
    { file: 'tests/cache/cache-service.test.ts', status: 'added', additions: 48, deletions: 0 },
    { file: 'tests/cache/cache-middleware.test.ts', status: 'added', additions: 72, deletions: 0 },
    { file: 'src/types/cache.ts', status: 'added', additions: 45, deletions: 0 },
    { file: 'src/utils/logger.ts', status: 'modified', additions: 25, deletions: 20 },
  ],
  fileDiffs: {},
};

// ── PR Details Variants ──────────────────────────────────────────────

/** PR state: Unit Tests failing, Mike requested changes */
export const DEMO_PR_DETAILS_FAILING: PRDetailedData = {
  ...DEMO_PR_DETAILS,
  reviews: [
    { login: 'sarahkim', name: 'Sarah Kim', avatarUrl: '', state: 'COMMENTED' },
    { login: 'mikerodriguez', name: 'Mike Rodriguez', avatarUrl: '', state: 'CHANGES_REQUESTED' },
  ],
  checks: [
    { ...DEMO_PR_DETAILS.checks[0] }, // Build & Typecheck: SUCCESS
    {
      name: 'Unit Tests',
      status: 'COMPLETED',
      conclusion: 'FAILURE',
      startedAt: new Date(now - 180_000).toISOString(),
      completedAt: new Date(now - 90_000).toISOString(),
    },
    { ...DEMO_PR_DETAILS.checks[2] }, // Integration Tests: SUCCESS
    { ...DEMO_PR_DETAILS.checks[3] }, // Lint & Format: SUCCESS
  ],
  comments: [
    DEMO_PR_DETAILS.comments[0], // Sarah's maxRetriesPerRequest comment
    {
      ...DEMO_PR_DETAILS.comments[1], // Mike's circuit breaker comment
      reviewState: 'CHANGES_REQUESTED',
    },
    DEMO_PR_DETAILS.comments[2], // Sarah's TTL comment
  ],
  approvalCount: 0,
};

/** PR state: CI fixed, still has Mike's review suggestion to address */
export const DEMO_PR_DETAILS_SUGGESTION: PRDetailedData = {
  ...DEMO_PR_DETAILS,
  reviews: [
    { login: 'sarahkim', name: 'Sarah Kim', avatarUrl: '', state: 'COMMENTED' },
    { login: 'mikerodriguez', name: 'Mike Rodriguez', avatarUrl: '', state: 'CHANGES_REQUESTED' },
  ],
  checks: DEMO_PR_DETAILS.checks, // all passing now
  comments: [
    DEMO_PR_DETAILS.comments[0],
    {
      ...DEMO_PR_DETAILS.comments[1],
      reviewState: 'CHANGES_REQUESTED',
    },
    DEMO_PR_DETAILS.comments[2],
  ],
  approvalCount: 0,
  commitCount: 5,
};

/** PR state: All checks pass, both reviewers approved */
export const DEMO_PR_DETAILS_PASSING: PRDetailedData = {
  ...DEMO_PR_DETAILS,
  reviews: [
    { login: 'sarahkim', name: 'Sarah Kim', avatarUrl: '', state: 'APPROVED' },
    { login: 'mikerodriguez', name: 'Mike Rodriguez', avatarUrl: '', state: 'APPROVED' },
  ],
  comments: [
    ...DEMO_PR_DETAILS.comments,
    {
      id: 'pr-c4',
      body: 'Circuit breaker looks great. Clean implementation with proper threshold and reset logic. Approving!',
      author: { login: 'mikerodriguez', name: 'Mike Rodriguez' },
      createdAt: new Date(now - 300_000).toISOString(),
      reviewState: 'APPROVED',
    },
  ],
  approvalCount: 2,
  commitCount: 6,
};

// ── PR Watcher & Pipeline Status Sequences ──────────────────────────

export function createPRWatcherStatus(
  phase: PRWatcherStatus['phase'],
  overrides?: Partial<PRWatcherStatus>,
): PRWatcherStatus {
  return {
    phase,
    message: `Phase: ${phase}`,
    since: Date.now(),
    fixAttempt: 0,
    maxAttempts: 3,
    notifications: [],
    ...overrides,
  };
}

export function createSessionStatus(
  state: SessionStatus['state'],
  description?: string,
): SessionStatus {
  return {
    state,
    lastActivity: Date.now(),
    stateStartedAt: Date.now(),
    description,
  };
}

export function createPipelineStatus(
  phase: PipelineStatus['phase'],
  overrides?: Partial<PipelineStatus>,
): PipelineStatus {
  return {
    phase,
    message: `Pipeline: ${phase}`,
    since: Date.now(),
    maxAttempts: 3,
    ...overrides,
  };
}
