# claudetree → Electron: Backend & Integration Plan

_Reference: t3code at /tmp/t3code. claudetree at ~/claudetree._

---

## 1. Current Backend Problems

### `backend/src/index.ts`

- **Hardcoded port 3001** (line: `const PORT = 3001`). Collides with any other process on that port. No dynamic allocation, no way for Electron main to know the actual port without out-of-band config.
- **No auth** on any route or WebSocket. Any process on localhost can hit `/api/worktrees/:id/delete` or attach to `/terminal/:worktreeId`.
- **No bootstrap protocol** between a future Electron parent and this child. The server just starts and there's no way for parent to know when it's ready.

### `backend/src/terminal/pty.ts`

- **Chicken-and-egg race** (`handleConnection`, line ~30): `getWorktree(worktreeId)` is called on WS connect. But `worktreeRegistry` in `worktrees.ts` is only populated when `GET /api/worktrees/:projectId` is called first. A client that opens a terminal tab before fetching worktrees gets `ws.close(1008, 'Worktree not found')` with no explanation. This is a hidden ordering dependency.
- **Blind `setTimeout` launch** (line ~55): `setTimeout(() => term.write('claude\r'), 500)` — 500ms is arbitrary. On a slow machine or under load, the shell hasn't finished its rc file. On a fast machine it may double-write if the client also sends input. No handshake.
- **No session recovery**. If the backend process crashes and restarts, all `sessions` map entries are gone. Reconnecting WS clients get a fresh PTY with no state. For a claude session mid-task, this is data loss.
- **No input ordering guarantee** with multiple clients. The `sessions.clients` Set doesn't serialize writes. If two WebSocket clients send data concurrently, `term.write` calls interleave arbitrarily.
- **`term.onExit` callback uses stale reference** (line ~63): `session.clients` is closed over at spawn time. If `sessions.delete(worktreeId)` runs first, the session object is still valid via closure — this is fine — but there's no guard against a race where a new session is created for the same worktreeId between `sessions.delete` and the `client.close()` loop. New session's clients don't get closed; old session's cleanup is done.
- **Shell environment not synced** (line ~48): `env: { ...process.env }`. On macOS, when launched from Electron (a GUI app), `process.env.PATH` is the OS default minimal PATH, not the user's shell PATH. `nvm`, `mise`, `homebrew` paths are all missing. `claude` CLI won't be found.
- **PTY lives in the HTTP server process** with no separation of concern. A crash in Express kills all PTY sessions.

### `backend/src/routes/worktrees.ts`

- **No mutex on concurrent create** (`POST /:projectId`, line ~52): two concurrent requests with the same `name` both call `git worktree add <path> -b <name>`. Second one fails with a git error but only after the first one succeeds — no preemptive lock. Response to caller is a 500, but the worktree may be partially created.
- **`worktreeRegistry` is in-memory only**. Restart loses all registered worktrees. On next `GET /:projectId`, they get re-discovered from `git worktree list`, but with new IDs — breaking any terminal sessions open by ID.
- **`DELETE /:id` does not kill the PTY session** for the worktree being removed. The PTY keeps running in a deleted directory. `killSession(worktreeId)` exists in `pty.ts` but is never called from the delete route.
- **`GET /:projectId` creates new UUIDs for re-discovered worktrees** unless `existing` is found. But `existing` lookup is `Array.from(worktreeRegistry.values()).find(w => w.path === wtPath)`. If registry was cleared (restart), `existing` is always undefined → new UUID every time → old terminal session IDs become dangling.

### `backend/src/routes/projects.ts`

- **`loadConfig()` + `saveConfig()` with no file lock** (`POST /`). Two concurrent project-add requests read the same config, both append their project, both write back — last write wins, first project is lost.

---

## 2. Electron Main Process Design

### File: `apps/desktop/src/main.ts`

Structure mirrors t3code's `main.ts` closely. Key differences for claudetree:

```
claudetree-electron/
  apps/
    desktop/
      src/
        main.ts           ← Electron main (this doc)
        preload.ts        ← contextBridge exposure
        syncShellEnvironment.ts  ← copy from t3code pattern
        ptyManager.ts     ← node-pty session manager (lives in main)
        worktreeWorker.ts ← DrainableWorker for git ops
```

#### Server Subprocess Management

Same pattern as t3code `startBackend()`:

```typescript
// Allocate a random loopback port before spawning
const backendPort = await reserveLoopbackPort();
const backendAuthToken = crypto.randomBytes(24).toString('hex');

const child = ChildProcess.spawn(process.execPath, [backendEntry, '--bootstrap-fd', '3'], {
  cwd: resolveBackendCwd(),
  env: {
    ...backendChildEnv(),
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'pipe'],  // fd3 = bootstrap pipe
});

// Send config to backend via fd3 (one-shot, then close)
const bootstrapStream = child.stdio[3];
bootstrapStream.write(JSON.stringify({
  port: backendPort,
  authToken: backendAuthToken,
  dataDir: resolveDataDir(),
}) + '\n');
bootstrapStream.end();
```

The backend reads from fd3 at startup to get its port and auth token — no hardcoded values.

**Backend ready signal**: Backend writes `{"status":"ready","port":N}` to stdout. Main process listens for this before telling renderer the backend is up. Alternative: poll `GET /healthz` with exponential backoff (simpler, no stdout parsing).

#### Shell Environment Sync

Call `syncShellEnvironment()` **synchronously at the top of main.ts**, before `app.whenReady()`. This is the exact t3code pattern:

```typescript
// main.ts — top of file, before anything else
syncShellEnvironment();
```

`syncShellEnvironment.ts` for claudetree:

```typescript
import { execFileSync } from 'child_process';

export function syncShellEnvironment(): void {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return;
  
  const loginShell = process.env.SHELL || '/bin/zsh';
  try {
    // Run a login shell and dump its environment
    const raw = execFileSync(loginShell, ['-l', '-c', 'env'], {
      encoding: 'utf8',
      timeout: 3000,
      env: { HOME: process.env.HOME, USER: process.env.USER, LOGNAME: process.env.LOGNAME },
    });
    
    for (const line of raw.split('\n')) {
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq);
      const val = line.slice(eq + 1);
      // Only sync PATH and agent socket — don't clobber Electron env
      if (key === 'PATH') process.env.PATH = val;
      if (key === 'SSH_AUTH_SOCK' && !process.env.SSH_AUTH_SOCK) {
        process.env.SSH_AUTH_SOCK = val;
      }
    }
  } catch {
    // Non-fatal: keep inherited env
  }
}
```

This ensures `claude` CLI is found when PTY is spawned in main process.

#### IPC Channels

Defined as constants in a shared `ipc-channels.ts`:

```typescript
export const IPC = {
  // Backend URL (sync, called before window shows)
  GET_BACKEND_URL: 'ct:get-backend-url',
  
  // Native dialogs
  PICK_FOLDER: 'ct:pick-folder',
  CONFIRM: 'ct:confirm',
  
  // PTY — main process manages these (see section 3)
  TERMINAL_OPEN: 'ct:terminal:open',
  TERMINAL_WRITE: 'ct:terminal:write',
  TERMINAL_RESIZE: 'ct:terminal:resize',
  TERMINAL_CLOSE: 'ct:terminal:close',
  TERMINAL_DATA: 'ct:terminal:data',    // main → renderer push
  TERMINAL_EXIT: 'ct:terminal:exit',    // main → renderer push
  
  // Worktree ops (queued in main)
  WORKTREE_CREATE: 'ct:worktree:create',
  WORKTREE_DELETE: 'ct:worktree:delete',
  WORKTREE_LIST: 'ct:worktree:list',
  
  // Project ops
  PROJECT_ADD: 'ct:project:add',
  PROJECT_LIST: 'ct:project:list',
} as const;
```

---

## 3. PTY Architecture in Electron

### Option A: Keep PTY in Backend Subprocess + WebSocket

**Architecture**: Express + node-pty in the backend subprocess, same as now. Renderer connects via WebSocket at `ws://127.0.0.1:<port>/terminal/<id>`. IPC only used for URL negotiation.

**Pros**:
- Minimal migration effort. Frontend code unchanged.
- PTY and HTTP API co-located — worktree lookup is a simple in-process call.
- Can test backend in isolation without Electron.

**Cons**:
- node-pty must be rebuilt for Electron's Node ABI anyway (native module). Same build step regardless.
- Backend process crash kills all terminal sessions. No IPC-level recovery path.
- WebSocket auth is an afterthought (token in query param, visible in logs).
- Shell env sync must happen in backend too, not just main — two places to maintain.
- Adding any native OS feature (e.g., macOS keychain for auth) requires it in backend subprocess, not in Electron where it's natural.
- Double process overhead for PTY data: kernel → backend stdout → WS → renderer.

### Option B: Move PTY to Electron Main + IPC (Recommended)

**Architecture**: node-pty sessions live in Electron main process. Renderer sends `terminal:write`/`terminal:resize` via IPC. Main pushes `terminal:data`/`terminal:exit` events back. Backend subprocess handles only git/config REST operations — no PTY.

**Pros**:
- **Crash isolation**: backend subprocess crash doesn't kill terminal sessions. Users can keep working.
- **Single env sync**: `syncShellEnvironment()` in main already gives PTY the correct PATH.
- **IPC is lower latency and more reliable than WS** for same-machine communication. No framing, no reconnect logic.
- **Session persistence across backend restarts**: PTY sessions live in the main process which has the same lifetime as the app window.
- **Clean auth model**: IPC is process-local, no token needed.
- **node-pty native rebuild**: only one place — Electron main. Not needed in backend.
- Aligns with t3code's pattern: t3code's `NativeApi.terminal` is entirely IPC-driven from main.

**Cons**:
- More code in main.ts (mitigated by extracting `ptyManager.ts`).
- PTY no longer testable without Electron (mitigated by extracting pure logic with dependency injection).
- Any PTY feature needed by backend (e.g., "inject command to all sessions on project delete") requires an internal call to `ptyManager`, not a REST call.

### Recommendation: **Option B**

The backend subprocess should not be responsible for managing long-lived OS resources like PTYs. The data path is better (IPC > WS for local), and the crash isolation is a concrete reliability win. The migration cost is acceptable — `ptyManager.ts` is ~100 lines of well-isolated code.

### `ptyManager.ts` Skeleton

```typescript
import * as pty from 'node-pty';
import { ipcMain, WebContents } from 'electron';
import { IPC } from './ipc-channels';

interface PtySession {
  term: pty.IPty;
  worktreeId: string;
  subscribers: Set<WebContents>;
}

const sessions = new Map<string, PtySession>();

export function registerPtyIpcHandlers(): void {
  ipcMain.handle(IPC.TERMINAL_OPEN, async (_event, { worktreeId, cwd, cols, rows }) => {
    let session = sessions.get(worktreeId);
    if (!session) {
      const shell = process.platform === 'darwin' ? 'zsh' : 'bash';
      const term = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols ?? 120,
        rows: rows ?? 30,
        cwd,
        env: { ...process.env } as Record<string, string>,
      });

      session = { term, worktreeId, subscribers: new Set() };
      sessions.set(worktreeId, session);

      term.onData((data) => {
        for (const wc of session!.subscribers) {
          if (!wc.isDestroyed()) {
            wc.send(IPC.TERMINAL_DATA, { worktreeId, data });
          }
        }
      });

      term.onExit(({ exitCode }) => {
        sessions.delete(worktreeId);
        for (const wc of session!.subscribers) {
          if (!wc.isDestroyed()) {
            wc.send(IPC.TERMINAL_EXIT, { worktreeId, exitCode });
          }
        }
      });

      // Defer claude launch until shell is ready
      // Use a prompt-detection approach instead of setTimeout:
      // watch for the prompt character in onData, then write once
      waitForShellReady(term).then(() => term.write('claude\r'));
    }

    session.subscribers.add(_event.sender);
    _event.sender.once('destroyed', () => session?.subscribers.delete(_event.sender));

    return { worktreeId, pid: session.term.pid };
  });

  ipcMain.handle(IPC.TERMINAL_WRITE, (_event, { worktreeId, data }) => {
    sessions.get(worktreeId)?.term.write(data);
  });

  ipcMain.handle(IPC.TERMINAL_RESIZE, (_event, { worktreeId, cols, rows }) => {
    sessions.get(worktreeId)?.term.resize(cols, rows);
  });

  ipcMain.handle(IPC.TERMINAL_CLOSE, (_event, { worktreeId }) => {
    killSession(worktreeId);
  });
}

export function killSession(worktreeId: string): void {
  const s = sessions.get(worktreeId);
  if (s) {
    s.term.kill();
    sessions.delete(worktreeId);
  }
}

export function killAllSessions(): void {
  for (const [id] of sessions) killSession(id);
}

// Wait for shell prompt instead of blind timeout
function waitForShellReady(term: pty.IPty): Promise<void> {
  return new Promise((resolve) => {
    const PROMPT_PATTERNS = [/\$\s*$/, />\s*$/, /%\s*$/];
    const disposable = term.onData((data) => {
      if (PROMPT_PATTERNS.some((re) => re.test(data))) {
        disposable.dispose();
        resolve();
      }
    });
    // Fallback: 2s max
    setTimeout(() => { disposable.dispose(); resolve(); }, 2000);
  });
}
```

---

## 4. Process Lifecycle

### Startup Sequence

```
1. main.ts top-level:
   - syncShellEnvironment()          ← before anything, get real PATH
   - app.setPath('userData', ...)    ← before app.whenReady()

2. app.whenReady():
   - reserveLoopbackPort()           ← dynamic port, no collision
   - generateAuthToken()
   - registerIpcHandlers()           ← including PTY handlers
   - registerPtyIpcHandlers()
   - startBackend()                  ← spawn backend subprocess
   - waitForBackendReady()           ← poll GET /healthz or wait for stdout signal
   - createWindow()                  ← show window only after backend is up
```

`waitForBackendReady()`:
```typescript
async function waitForBackendReady(port: number, token: string, maxMs = 10_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return;
    } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Backend did not become ready within ${maxMs}ms`);
}
```

Show a loading spinner in the BrowserWindow until backend is ready (load a minimal `loading.html` first, then navigate to the app).

### Crash Recovery

Mirror t3code's `scheduleBackendRestart()` exactly:

```typescript
function scheduleBackendRestart(reason: string): void {
  if (isQuitting || restartTimer) return;
  const delayMs = Math.min(500 * 2 ** restartAttempt, 10_000);
  restartAttempt++;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startBackend();
  }, delayMs);
}
```

- **Backend crash** → restart with backoff. PTY sessions in main process are **unaffected** (this is the key benefit of Option B).
- **PTY crash** (individual session): `term.onExit` fires → notify renderer → renderer shows "Session ended, restart?" UI.
- **Main process crash**: OS cleans up PTYs (node-pty registers atexit). On re-launch, sessions start fresh. Acceptable — Electron main crashing is a hard failure anyway.
- Use `WeakSet<ChildProcess>` (same as t3code `expectedBackendExitChildren`) to distinguish intentional kills from crashes.

### Clean Shutdown

```typescript
app.on('before-quit', () => {
  isQuitting = true;
  killAllSessions();           // kill all PTYs first
  stopBackend();               // SIGTERM backend, SIGKILL after 2s
  restoreStdIoCapture?.();
});
```

For `window-all-closed` on non-macOS: call `app.quit()` only after confirming no active PTY sessions, or just trust `before-quit`.

### Worktree Process Management

When a worktree is deleted:
1. `ipcMain.handle(IPC.WORKTREE_DELETE)` → enqueue to `WorktreeWorker`
2. Worker calls `killSession(worktreeId)` **before** git worktree remove
3. Then calls `git worktree remove --force`
4. Emits deletion event to renderer

This ordering matters: don't delete the directory while a PTY is writing to files inside it.

---

## 5. DrainableWorker Adoption

DrainableWorker is an Effect-based queue. If claudetree isn't using Effect, adapt the pattern with a plain Promise queue:

### Adapted `WorktreeWorker` (no Effect dependency)

```typescript
type WorktreeOp =
  | { kind: 'create'; projectId: string; name: string; resolve: (wt: Worktree) => void; reject: (e: Error) => void }
  | { kind: 'delete'; worktreeId: string; resolve: () => void; reject: (e: Error) => void }
  | { kind: 'list';   projectId: string; resolve: (wts: Worktree[]) => void; reject: (e: Error) => void };

class WorktreeWorker {
  private queue: WorktreeOp[] = [];
  private running = false;

  enqueue<T>(op: Omit<WorktreeOp, 'resolve' | 'reject'>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...op, resolve, reject } as WorktreeOp);
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const op = this.queue.shift()!;
      try {
        const result = await this.execute(op);
        op.resolve(result as never);
      } catch (err) {
        op.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
    this.running = false;
  }

  private async execute(op: WorktreeOp): Promise<unknown> {
    switch (op.kind) {
      case 'create': return createWorktree(op.projectId, op.name);
      case 'delete': return deleteWorktree(op.worktreeId);
      case 'list':   return listWorktrees(op.projectId);
    }
  }
}

export const worktreeWorker = new WorktreeWorker();
```

**Registration in IPC handlers**:
```typescript
ipcMain.handle(IPC.WORKTREE_CREATE, (_event, { projectId, name }) =>
  worktreeWorker.enqueue({ kind: 'create', projectId, name })
);

ipcMain.handle(IPC.WORKTREE_DELETE, async (_event, { worktreeId }) => {
  killSession(worktreeId);  // kill PTY before queuing delete
  return worktreeWorker.enqueue({ kind: 'delete', worktreeId });
});
```

**What this fixes**:
- Two concurrent `WORKTREE_CREATE` requests for the same name → serialized, second one gets a clear error from git, not a race-corrupted state.
- Delete during create → create completes first (or fails cleanly), then delete runs.
- Renderer gets consistent responses, not interleaved errors.

If adopting Effect is viable, use `makeDrainableWorker` from t3code directly. The `drain()` effect is especially useful for testing: await `worker.drain` to assert state after all queued ops complete, no timing hacks.

---

## 6. IPC Contract Sketch

All channels string-prefixed `ct:` to avoid collisions. Types defined in `packages/contracts/src/ipc.ts`.

```typescript
// packages/contracts/src/ipc.ts

export interface ClaudetreeBridge {
  // ── System ──────────────────────────────────────────────────────────────
  getBackendUrl: () => string | null;    // sync, called before first render
  pickFolder: () => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  
  // ── Terminal (PTY in main) ───────────────────────────────────────────────
  terminal: {
    open: (input: TerminalOpenInput) => Promise<{ worktreeId: string; pid: number }>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    close: (input: { worktreeId: string }) => Promise<void>;
    // Push channels (main → renderer)
    onData: (cb: (e: { worktreeId: string; data: string }) => void) => () => void;
    onExit: (cb: (e: { worktreeId: string; exitCode: number }) => void) => () => void;
  };

  // ── Projects ─────────────────────────────────────────────────────────────
  projects: {
    list: () => Promise<Project[]>;
    add: (path: string) => Promise<Project>;
  };

  // ── Worktrees ─────────────────────────────────────────────────────────────
  worktrees: {
    list: (projectId: string) => Promise<Worktree[]>;
    create: (input: { projectId: string; name: string }) => Promise<Worktree>;
    delete: (worktreeId: string) => Promise<void>;
  };
}

// Input types
export interface TerminalOpenInput {
  worktreeId: string;
  cwd: string;
  cols?: number;
  rows?: number;
}
export interface TerminalWriteInput { worktreeId: string; data: string; }
export interface TerminalResizeInput { worktreeId: string; cols: number; rows: number; }

export interface Project { id: string; name: string; path: string; worktreeBase: string; }
export interface Worktree { id: string; name: string; path: string; branch: string; projectId: string; }
```

**Preload bridge** (same pattern as t3code):

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc-channels';
import type { ClaudetreeBridge } from '@claudetree/contracts';

contextBridge.exposeInMainWorld('claudetreeBridge', {
  getBackendUrl: () => ipcRenderer.sendSync(IPC.GET_BACKEND_URL),
  pickFolder: () => ipcRenderer.invoke(IPC.PICK_FOLDER),
  confirm: (msg) => ipcRenderer.invoke(IPC.CONFIRM, msg),

  terminal: {
    open: (input) => ipcRenderer.invoke(IPC.TERMINAL_OPEN, input),
    write: (input) => ipcRenderer.invoke(IPC.TERMINAL_WRITE, input),
    resize: (input) => ipcRenderer.invoke(IPC.TERMINAL_RESIZE, input),
    close: (input) => ipcRenderer.invoke(IPC.TERMINAL_CLOSE, input),
    onData: (cb) => {
      const handler = (_: unknown, e: { worktreeId: string; data: string }) => cb(e);
      ipcRenderer.on(IPC.TERMINAL_DATA, handler);
      return () => ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler);
    },
    onExit: (cb) => {
      const handler = (_: unknown, e: { worktreeId: string; exitCode: number }) => cb(e);
      ipcRenderer.on(IPC.TERMINAL_EXIT, handler);
      return () => ipcRenderer.removeListener(IPC.TERMINAL_EXIT, handler);
    },
  },

  projects: {
    list: () => ipcRenderer.invoke(IPC.PROJECT_LIST),
    add: (path) => ipcRenderer.invoke(IPC.PROJECT_ADD, path),
  },

  worktrees: {
    list: (projectId) => ipcRenderer.invoke(IPC.WORKTREE_LIST, projectId),
    create: (input) => ipcRenderer.invoke(IPC.WORKTREE_CREATE, input),
    delete: (id) => ipcRenderer.invoke(IPC.WORKTREE_DELETE, id),
  },
} satisfies ClaudetreeBridge);
```

**Decision on REST vs full IPC**: Keep the backend Express server for REST calls that are naturally request/response (projects, worktrees CRUD, diff, commit). These routes are already well-structured. Move **only PTY** to IPC. The renderer can call `fetch('http://127.0.0.1:<port>/api/...')` for everything else — same as the web version, minimal frontend changes. Get the backend URL via `window.claudetreeBridge.getBackendUrl()` on startup.

This hybrid approach:
- Minimizes frontend refactor
- Moves the one actually problematic thing (PTY lifecycle) to main
- Preserves the option to test backend routes independently
- Backend subprocess becomes stateless enough that crash-restart is seamless

---

## Migration Priority Order

1. **Port allocation + bootstrap pipe** — fix collision, enable Electron to know port
2. **syncShellEnvironment** — fix PATH before anything else; `claude` must be findable
3. **PTY → main process** (`ptyManager.ts`) — crash isolation, correct env
4. **WorktreeWorker queue** — prevent git operation races
5. **worktreeRegistry persistence** — write to disk (JSON file), reload on start; fixes ID stability
6. **DELETE kills PTY** — call `killSession` before `git worktree remove`
7. **Auth token on all routes** — middleware check `Authorization: Bearer <token>`, token passed via bootstrap pipe
8. **Backend ready signal** — `GET /healthz`, window shown only after backend up
