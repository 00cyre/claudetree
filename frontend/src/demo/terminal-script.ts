/**
 * Scripted terminal output for the demo.
 * Each entry has text to write and delay before writing (ms).
 * ANSI codes are used for colors matching Claude Code's actual output.
 */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const WHITE = '\x1b[37m';

export interface ScriptLine {
  text: string;
  delay: number; // ms before writing this line
}

const DEV_SCRIPT: ScriptLine[] = [
  // Boot sequence
  { text: '\r\n', delay: 200 },
  { text: `${DIM}╭─────────────────────────────────────────────╮${RESET}\r\n`, delay: 50 },
  { text: `${DIM}│${RESET}  ${BOLD}${CYAN}Claude Code${RESET} ${DIM}v1.2.3${RESET}                        ${DIM}│${RESET}\r\n`, delay: 50 },
  { text: `${DIM}│${RESET}  ${DIM}/Volumes/zx1/claudetree/.worktrees/${RESET}       ${DIM}│${RESET}\r\n`, delay: 50 },
  { text: `${DIM}│${RESET}  ${DIM}redis-cache-server${RESET}                        ${DIM}│${RESET}\r\n`, delay: 50 },
  { text: `${DIM}╰─────────────────────────────────────────────╯${RESET}\r\n`, delay: 100 },
  { text: '\r\n', delay: 300 },

  // Initial analysis
  { text: `${BOLD}${CYAN}❯${RESET} I'll implement the Redis cache server as described in ${GREEN}ENG-847${RESET}.\r\n`, delay: 100 },
  { text: `  Let me analyze the requirements and set up the project structure.\r\n`, delay: 200 },
  { text: '\r\n', delay: 400 },

  // Creating files
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}src/config/redis.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Redis configuration with env-based settings${RESET}\r\n`, delay: 100 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}src/cache/redis-client.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Connection pool (max 10), auto-reconnection${RESET}\r\n`, delay: 100 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}src/cache/cache-service.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Cache-aside pattern with per-category TTL${RESET}\r\n`, delay: 100 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}src/cache/cache-middleware.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Auto-invalidation on mutations${RESET}\r\n`, delay: 100 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}src/routes/health.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → GET /health/redis endpoint${RESET}\r\n`, delay: 100 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}src/types/cache.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Type definitions for cache config${RESET}\r\n`, delay: 100 },
  { text: '\r\n', delay: 300 },

  // Installing dependencies
  { text: `${MAGENTA}📦${RESET} Installing dependencies...\r\n`, delay: 200 },
  { text: `${DIM}   npm install ioredis@^5.3.0${RESET}\r\n`, delay: 100 },
  { text: `${GREEN}✓${RESET} Added ioredis@5.3.2\r\n`, delay: 200 },
  { text: '\r\n', delay: 200 },

  // Modifying existing files
  { text: `${BLUE}✎${RESET} Updating ${BOLD}src/index.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Registering cache middleware and health route${RESET}\r\n`, delay: 100 },
  { text: `${BLUE}✎${RESET} Updating ${BOLD}src/utils/logger.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Adding cache-specific log formatters${RESET}\r\n`, delay: 100 },
  { text: '\r\n', delay: 300 },

  // Creating tests
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}tests/cache/redis-client.test.ts${RESET}...\r\n`, delay: 120 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}tests/cache/cache-service.test.ts${RESET}...\r\n`, delay: 120 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}tests/cache/cache-middleware.test.ts${RESET}...\r\n`, delay: 120 },
  { text: '\r\n', delay: 200 },

  // Running tests
  { text: `${MAGENTA}🧪${RESET} Running tests...\r\n`, delay: 300 },
  { text: '\r\n', delay: 200 },
  { text: `  ${GREEN}✓${RESET} RedisClient connects with pool ${DIM}(45ms)${RESET}\r\n`, delay: 100 },
  { text: `  ${GREEN}✓${RESET} RedisClient handles reconnection ${DIM}(23ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} RedisClient ping health check ${DIM}(8ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} CacheService get/set operations ${DIM}(12ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} CacheService TTL expiration ${DIM}(67ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} CacheService per-category config ${DIM}(15ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} CacheService invalidation on mutation ${DIM}(34ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} CacheService hit/miss metrics ${DIM}(9ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} Middleware auto-invalidates on POST ${DIM}(41ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} Middleware skips GET requests ${DIM}(5ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} Fallback to DB when Redis unavailable ${DIM}(89ms)${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}✓${RESET} Health endpoint reports status ${DIM}(12ms)${RESET}\r\n`, delay: 80 },
  { text: '\r\n', delay: 100 },
  { text: `  ${GREEN}${BOLD}12 passing${RESET} ${DIM}(445ms)${RESET}\r\n`, delay: 200 },
  { text: '\r\n', delay: 300 },

  // Summary
  { text: `${BOLD}${GREEN}✔${RESET} ${BOLD}All changes ready for review.${RESET}\r\n`, delay: 100 },
  { text: '\r\n', delay: 100 },
  { text: `${DIM}Summary of changes:${RESET}\r\n`, delay: 80 },
  { text: `  ${GREEN}+487${RESET} ${DIM}additions${RESET}  ${YELLOW}-23${RESET} ${DIM}deletions${RESET}  ${DIM}across${RESET} ${WHITE}12 files${RESET}\r\n`, delay: 80 },
  { text: '\r\n', delay: 80 },
  { text: `  ${DIM}•${RESET} Redis client with connection pooling (max 10)\r\n`, delay: 60 },
  { text: `  ${DIM}•${RESET} Cache-aside pattern for profiles, sessions, API responses\r\n`, delay: 60 },
  { text: `  ${DIM}•${RESET} TTL expiration: 5min profiles, 30min sessions, 2min API\r\n`, delay: 60 },
  { text: `  ${DIM}•${RESET} Cache invalidation middleware on mutations\r\n`, delay: 60 },
  { text: `  ${DIM}•${RESET} Health check endpoint at GET /health/redis\r\n`, delay: 60 },
  { text: `  ${DIM}•${RESET} 12 tests passing (unit + integration)\r\n`, delay: 60 },
  { text: '\r\n', delay: 200 },
  { text: `${DIM}[Session ended]${RESET}\r\n`, delay: 100 },
];

const CI_FIX_SCRIPT: ScriptLine[] = [
  { text: '\r\n', delay: 150 },
  { text: `${BOLD}${CYAN}❯${RESET} CI check ${RED}Unit Tests${RESET} is failing. Let me investigate.\r\n`, delay: 100 },
  { text: '\r\n', delay: 300 },
  { text: `${BLUE}🔍${RESET} Reading pipeline logs...\r\n`, delay: 200 },
  { text: `${DIM}   FAIL tests/cache/cache-service.test.ts${RESET}\r\n`, delay: 150 },
  { text: `${DIM}   ● CacheService › should respect maxRetriesPerRequest config${RESET}\r\n`, delay: 100 },
  { text: `${DIM}     Expected: 5${RESET}\r\n`, delay: 80 },
  { text: `${DIM}     Received: 3${RESET}\r\n`, delay: 80 },
  { text: '\r\n', delay: 200 },
  { text: `${BOLD}${CYAN}❯${RESET} The test expects ${YELLOW}maxRetriesPerRequest${RESET} to be configurable,\r\n`, delay: 100 },
  { text: `  but it's hardcoded to ${RED}3${RESET} in ${BOLD}redis-client.ts${RESET}.\r\n`, delay: 100 },
  { text: '\r\n', delay: 200 },
  { text: `${BLUE}✎${RESET} Updating ${BOLD}src/cache/redis-client.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Reading maxRetriesPerRequest from config (default: 3)${RESET}\r\n`, delay: 100 },
  { text: `${BLUE}✎${RESET} Updating ${BOLD}src/config/redis.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Adding REDIS_MAX_RETRIES env variable${RESET}\r\n`, delay: 100 },
  { text: '\r\n', delay: 200 },
  { text: `${MAGENTA}🧪${RESET} Running tests...\r\n`, delay: 300 },
  { text: '\r\n', delay: 150 },
  { text: `  ${GREEN}✓${RESET} CacheService should respect maxRetriesPerRequest config ${DIM}(18ms)${RESET}\r\n`, delay: 100 },
  { text: `  ${GREEN}${BOLD}12 passing${RESET} ${DIM}(438ms)${RESET}\r\n`, delay: 150 },
  { text: '\r\n', delay: 200 },
  { text: `${MAGENTA}📤${RESET} Pushing fix to ${CYAN}feat/ENG-847-redis-cache-server${RESET}...\r\n`, delay: 200 },
  { text: `${GREEN}✓${RESET} Fix pushed successfully.\r\n`, delay: 150 },
  { text: '\r\n', delay: 100 },
  { text: `${DIM}[Session ended]${RESET}\r\n`, delay: 100 },
];

const ADDRESS_REVIEW_SCRIPT: ScriptLine[] = [
  { text: '\r\n', delay: 150 },
  { text: `${BOLD}${CYAN}❯${RESET} Addressing review from ${MAGENTA}Mike Rodriguez${RESET}:\r\n`, delay: 100 },
  { text: `${DIM}   "Should we add a circuit breaker here?"${RESET}\r\n`, delay: 100 },
  { text: '\r\n', delay: 300 },
  { text: `${BOLD}${CYAN}❯${RESET} Good suggestion. Adding a circuit breaker to prevent\r\n`, delay: 100 },
  { text: `  cascading timeouts when Redis is down.\r\n`, delay: 100 },
  { text: '\r\n', delay: 200 },
  { text: `${BLUE}✎${RESET} Updating ${BOLD}src/cache/cache-service.ts${RESET}...\r\n`, delay: 150 },
  { text: `${DIM}   → Adding CircuitBreaker class with failure threshold${RESET}\r\n`, delay: 100 },
  { text: `${DIM}   → Wrapping get/set operations with circuit check${RESET}\r\n`, delay: 100 },
  { text: `${YELLOW}⚡${RESET} Creating ${BOLD}tests/cache/circuit-breaker.test.ts${RESET}...\r\n`, delay: 120 },
  { text: '\r\n', delay: 200 },
  { text: `${MAGENTA}🧪${RESET} Running tests...\r\n`, delay: 250 },
  { text: `  ${GREEN}${BOLD}14 passing${RESET} ${DIM}(512ms)${RESET}\r\n`, delay: 150 },
  { text: '\r\n', delay: 200 },
  { text: `${MAGENTA}📤${RESET} Pushing changes to ${CYAN}feat/ENG-847-redis-cache-server${RESET}...\r\n`, delay: 200 },
  { text: `${GREEN}✓${RESET} Changes pushed successfully.\r\n`, delay: 150 },
  { text: '\r\n', delay: 100 },
  { text: `${DIM}[Session ended]${RESET}\r\n`, delay: 100 },
];

export const SCRIPTS: Record<string, ScriptLine[]> = {
  none: [],
  dev: DEV_SCRIPT,
  'ci-fix': CI_FIX_SCRIPT,
  'address-review': ADDRESS_REVIEW_SCRIPT,
};

// Keep backward compat
export const TERMINAL_SCRIPT = DEV_SCRIPT;

export function getScriptDuration(scriptId = 'dev'): number {
  const script = SCRIPTS[scriptId] ?? DEV_SCRIPT;
  return script.reduce((sum, line) => sum + line.delay, 0);
}
