# claudetree → Electron Migration Plan

## Executive Summary

claudetree is a web-based Claude Code interface (Express + React) with critical architectural flaws:
ephemeral in-memory state, timing hacks for PTY launch, no ordered event delivery, and a frontend
that destroys terminal sessions on every tab switch. This plan migrates it to a proper Electron
desktop app in five phases over ~13 days of focused engineering.

The core insight: **PTY sessions must live in Electron main process** (not the backend subprocess),
worktree state must be persisted to disk with stable IDs, and the frontend must be rebuilt around
three focused Zustand stores with IPC-based terminal I/O. The backend survives but is demoted to a
pure REST worker for git ops — it no longer owns terminals or state.

---

## Goals

- Move PTY management to Electron main process — terminals survive backend restarts
- Persist worktree registry to disk with SHA-based stable IDs (survive app restarts)
- Implement bootstrap protocol: dynamic port, auth token via fd3, ready signal
- Sync shell environment from login shell so `claude` CLI is always found
- Replace raw WebSocket terminal I/O with typed IPC channels
- Eliminate terminal scrollback destruction on worktree tab switches
- Add WebSocket reconnect logic and visible connection state in UI
- Replace setTimeout(500) launch hack with proper event-driven state machine
- Queue worktree git operations (no more race conditions on concurrent creates)
- Surface error states throughout the UI (currently zero)

## Non-Goals

- Adopting Effect.ts / fp-ts wholesale — reimplement patterns in plain TypeScript
- Switching from PTY to JSON-RPC for claude process (claudeCode provider in t3code is a stub)
- Rewriting FeaturesTab, ReviewTab, DiffViewer, CommitPanel — they work fine
- Adding multi-user or remote access support
- SQLite persistence (JSON file registry is sufficient for v1)
- Automated E2E test suite (unit tests for ordering infrastructure only)

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│                                                             │
│  main.ts ──► syncShellEnvironment.ts (PATH, SSH_AUTH_SOCK)  │
│      │                                                      │
│      ├──► ptyManager.ts (node-pty sessions per worktree)    │
│      │       sessions: Map<sessionId, PtySession>           │
│      │       IPC: ct:terminal:open/write/resize/close/data  │
│      │                                                      │
│      ├──► worktreeWorker.ts (AsyncQueue<WorktreeJob>)       │
│      │       IPC: ct:worktree:create/delete/list            │
│      │       persistence: <dataDir>/worktrees.json          │
│      │                                                      │
│      └──► backend subprocess (Express REST only)            │
│              bootstrap: fd3 pipe {port, authToken, dataDir} │
│              routes: /git/diff, /git/commit, /config        │
│              NO PTY, NO state, NO hardcoded values          │
│                                                             │
│  preload.ts ──► contextBridge (claudetreeBridge API)        │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────▼──────────────────────────────────┐
│                    Renderer Process                          │
│                                                             │
│  App.tsx                                                    │
│    └──► IPC bootstrap module (init stores from welcome)     │
│                                                             │
│  stores/                                                    │
│    appStore.ts     — projects, worktrees, connectionStatus  │
│    uiStore.ts      — selectedProjectId, selectedWorktreeId  │
│    connectionStore.ts — transport state, pendingRequests    │
│                                                             │
│  components/                                                │
│    Sidebar.tsx        (rewrite — subscribe to appStore)     │
│    Terminal.tsx       (rewrite — IPC, cached xterm instances)│
│    ConnectionBanner.tsx (new)                               │
│    WorktreeStatusDot.tsx (new)                              │
│    FeaturesTab.tsx    (keep)                                │
│    ReviewTab.tsx      (keep)                                │
│    NewWorktreeModal.tsx (keep)                              │
│    DiffViewer.tsx     (keep)                                │
│    CommitPanel.tsx    (keep)                                │
└─────────────────────────────────────────────────────────────┘

Package structure:
apps/desktop/src/
  main.ts
  preload.ts
  syncShellEnvironment.ts
  ptyManager.ts
  worktreeWorker.ts
  worktreeRegistry.ts       ← persistence + stable ID logic
  bootstrapPipe.ts          ← fd3 protocol helpers
  ipcChannels.ts            ← shared channel name constants
  renderer/
    App.tsx
    stores/
      appStore.ts
      uiStore.ts
      connectionStore.ts
    components/
      Sidebar.tsx
      Terminal.tsx
      ConnectionBanner.tsx
      WorktreeStatusDot.tsx
      [existing components unchanged]
    lib/
      terminalCache.ts      ← xterm instance cache
      ipcBridge.ts          ← typed wrapper around claudetreeBridge
```

---

## Phase 0: Scaffold (1–2 days)

**Goal:** Wire up Electron shell, bootstrap pipe, shell env sync. App opens a window. No features yet.

### Tasks

**0.1 — Create `apps/desktop/src/ipcChannels.ts`**
Define all channel name constants as a typed const object. No logic, just names.
```
CT_TERMINAL_OPEN, CT_TERMINAL_WRITE, CT_TERMINAL_RESIZE,
CT_TERMINAL_CLOSE, CT_TERMINAL_DATA, CT_TERMINAL_EXIT,
CT_WORKTREE_CREATE, CT_WORKTREE_DELETE, CT_WORKTREE_LIST,
CT_PROJECT_ADD, CT_PROJECT_LIST, CT_GET_BACKEND_URL,
CT_PICK_FOLDER, CT_CONFIRM
```

**0.2 — Create `apps/desktop/src/syncShellEnvironment.ts`**
- Spawn `/bin/zsh -l -c 'env'` (or bash if zsh unavailable)
- Parse stdout into key=value pairs
- Merge PATH, SSH_AUTH_SOCK, HOME into `process.env`
- Verify `which claude` resolves; throw hard error if not found
- Export: `syncShellEnvironment(): void` (synchronous wrapper via `execFileSync`)
- Call in `main.ts` before `app.whenReady()`

**0.3 — Create `apps/desktop/src/bootstrapPipe.ts`**
- `reserveLoopbackPort(): Promise<number>` — bind to :0, get assigned port, close server
- `writeBootstrapToFd3(config: BootstrapConfig): void` — serialize `{port, authToken, dataDir}` as JSON to fd3
- `generateAuthToken(): string` — `crypto.randomBytes(32).toString('hex')`
- `BootstrapConfig` interface exported from this file

**0.4 — Rewrite `apps/desktop/src/main.ts`**
- Call `syncShellEnvironment()` at top
- Call `reserveLoopbackPort()` to get dynamic port
- Generate auth token
- Determine `dataDir` (`app.getPath('userData')`)
- Spawn backend subprocess with fd3 pipe open, pass `BootstrapConfig` via `writeBootstrapToFd3`
- Wait for backend stdout line `READY` before calling `mainWindow.show()`
- Register IPC handlers for `CT_GET_BACKEND_URL`, `CT_PICK_FOLDER`, `CT_CONFIRM`
- Use `mainWindow = new BrowserWindow({ show: false, ... })` pattern

**0.5 — Create `apps/desktop/src/preload.ts`**
Expose `window.claudetreeBridge` via `contextBridge.exposeInMainWorld`:
```typescript
{
  getBackendUrl(): Promise<string>
  pickFolder(): Promise<string | null>
  confirm(message: string): Promise<boolean>
  // terminal — filled in Phase 2
  // worktree — filled in Phase 1
}
```

**0.6 — Update backend `src/index.ts`** (existing Express app)
- Read bootstrap config from fd3: `JSON.parse(fs.readFileSync('/dev/fd/3', 'utf8'))`
- Replace hardcoded `PORT = 3001` with `config.port`
- Add auth middleware: check `Authorization: Bearer <authToken>` on all routes
- Write `READY\n` to stdout after `server.listen()` completes
- Remove all PTY/session code (to be moved in Phase 2)

### Testing Checkpoint
- `npm run electron` opens a window
- Console shows shell env synced, `claude` found
- Backend logs show dynamic port and auth token received
- `curl http://localhost:<port>/healthz -H "Authorization: Bearer <token>"` returns 200

---

## Phase 1: Core Engine (3–5 days)

**Goal:** Persisted worktree registry, queued git ops, stable IDs, IPC wired for worktrees/projects.

### Tasks

**1.1 — Create `apps/desktop/src/worktreeRegistry.ts`**
- `WorktreeRecord` interface: `{ id: string, path: string, projectId: string, branch: string, createdAt: number }`
- `stableId(absolutePath: string): string` — `crypto.createHash('sha256').update(path).digest('hex').slice(0, 16)`
- `WorktreeRegistry` class:
  - `constructor(dataDir: string)` — loads `<dataDir>/worktrees.json` on init
  - `get(id): WorktreeRecord | undefined`
  - `getAll(): WorktreeRecord[]`
  - `set(record: WorktreeRecord): void` — writes full JSON to disk after every mutation
  - `delete(id): void` — removes and writes to disk
  - `private persist(): void` — `fs.writeFileSync(path, JSON.stringify(records, null, 2))`

**1.2 — Create `apps/desktop/src/worktreeWorker.ts`**
Implement `AsyncQueue<T>` generic:
```typescript
class AsyncQueue<T> {
  private queue: Array<{ item: T, resolve, reject }> = []
  private running = false
  async enqueue(item: T): Promise<WorktreeResult>
  private async drain(): Promise<void>
}
```
Implement `WorktreeWorker`:
- `enqueue(job: WorktreeJob): Promise<WorktreeResult>`
- `processCreate(job)`: `git worktree add <path> -b <branch>`, update registry, emit push event
- `processDelete(job)`: close PTY session (via `ptyManager.close()`), `git worktree remove <path>`, update registry
- Use `execFile` with promisified callback (no shell injection)
- On error: reject with typed `WorktreeError`

**1.3 — Register worktree IPC handlers in `main.ts`**
```
ipcMain.handle(CT_WORKTREE_CREATE, async (_, job) => worktreeWorker.enqueue(job))
ipcMain.handle(CT_WORKTREE_DELETE, async (_, id) => worktreeWorker.enqueue({ type: 'delete', id }))
ipcMain.handle(CT_WORKTREE_LIST, async () => registry.getAll())
ipcMain.handle(CT_PROJECT_ADD, async (_, { path }) => projectRegistry.add(path))
ipcMain.handle(CT_PROJECT_LIST, async () => projectRegistry.getAll())
```

**1.4 — Create `apps/desktop/src/projectRegistry.ts`**
Same pattern as worktreeRegistry. Persists to `<dataDir>/projects.json`. ID = stable SHA of absolute path.

**1.5 — Update `renderer/lib/ipcBridge.ts`**
Typed wrappers for renderer side:
```typescript
export const ipcBridge = {
  createWorktree(job: CreateWorktreeJob): Promise<WorktreeRecord>
  deleteWorktree(id: string): Promise<void>
  listWorktrees(): Promise<WorktreeRecord[]>
  addProject(path: string): Promise<ProjectRecord>
  listProjects(): Promise<ProjectRecord[]>
}
```
Each method calls `window.claudetreeBridge.<method>()`.

**1.6 — Create `renderer/stores/appStore.ts`**
```typescript
const useAppStore = create<AppStore>((set) => ({
  projects: [],
  worktrees: [],
  connectionStatus: 'connecting',
  setFromWelcome: (data) => set({ projects: data.projects, worktrees: data.worktrees }),
  applyWorktreeEvent: (event) => set((s) => ({
    worktrees: applyEvent(s.worktrees, event)
  }))
}))
```

**1.7 — Create `renderer/stores/uiStore.ts`**
```typescript
const useUIStore = create<UIStore>((set) => ({
  selectedProjectId: null,
  selectedWorktreeId: null,
  activeTab: 'features',
  selectProject: (id) => set({ selectedProjectId: id, selectedWorktreeId: null }),
  selectWorktree: (id) => set({ selectedWorktreeId: id }),
  setTab: (tab) => set({ activeTab: tab })
}))
```

**1.8 — Fix stale closure bug in project loading**
In existing `loadProjects` (or its replacement in Sidebar): capture project ID in closure correctly.
Pattern: pass project ID as argument, not close over component state. Move fetch logic into store action.

### Testing Checkpoint
- Create a worktree from the UI, kill and restart the app — worktree still listed
- Create two worktrees simultaneously — second waits for first, no git corruption
- Delete a worktree — git confirms worktree removed, registry updated
- `registry.get(stableId(path))` returns same record after restart

---

## Phase 2: Terminal Overhaul (2–3 days)

**Goal:** PTY lives in main process, IPC-based I/O, terminal instances cached in renderer — no more scrollback destruction.

### Tasks

**2.1 — Create `apps/desktop/src/ptyManager.ts`**
```typescript
type SessionState = 'idle' | 'spawning' | 'ready' | 'running' | 'crashed' | 'recovering'

interface PtySession {
  id: string
  worktreeId: string
  pty: IPty
  state: SessionState
  webContents: WebContents
}

class PtyManager {
  private sessions = new Map<string, PtySession>()

  open(worktreeId: string, cwd: string, webContents: WebContents): string
  write(sessionId: string, data: string): void
  resize(sessionId: string, cols: number, rows: number): void
  close(sessionId: string): void
  getSession(worktreeId: string): PtySession | undefined

  private spawnSession(worktreeId: string, cwd: string, wc: WebContents): PtySession
  private transitionState(session: PtySession, next: SessionState): void
}
```
- `spawnSession`: use `node-pty` spawn, pass `process.env` (already synced)
- On `pty.onData`: `webContents.send(CT_TERMINAL_DATA, { worktreeId, data: Buffer.from(data) })`
- On `pty.onExit`: transition to `crashed`, send `CT_TERMINAL_EXIT`, attempt recovery after 1s
- Sessions keyed by `sessionId` (stable: reuse worktreeId as sessionId)
- Do NOT destroy session on tab switch — only on explicit `close()`

**2.2 — Register terminal IPC handlers in `main.ts`**
```
ipcMain.handle(CT_TERMINAL_OPEN, (e, { worktreeId, cwd }) =>
  ptyManager.open(worktreeId, cwd, e.sender))
ipcMain.on(CT_TERMINAL_WRITE, (_, { sessionId, data }) =>
  ptyManager.write(sessionId, data))
ipcMain.on(CT_TERMINAL_RESIZE, (_, { sessionId, cols, rows }) =>
  ptyManager.resize(sessionId, cols, rows))
ipcMain.handle(CT_TERMINAL_CLOSE, (_, { sessionId }) =>
  ptyManager.close(sessionId))
```

**2.3 — Update `preload.ts`** with terminal bridge:
```typescript
terminal: {
  open(worktreeId: string, cwd: string): Promise<string>
  write(sessionId: string, data: string): void
  resize(sessionId: string, cols: number, rows: number): void
  close(sessionId: string): Promise<void>
  onData(worktreeId: string, cb: (data: Uint8Array) => void): () => void
  onExit(worktreeId: string, cb: () => void): () => void
}
```
`onData` listener: register `ipcRenderer.on(CT_TERMINAL_DATA, ...)`, filter by worktreeId, pass `Buffer` not string.

**2.4 — Create `renderer/lib/terminalCache.ts`**
```typescript
const cache = new Map<string, Terminal>()

export function getOrCreateTerminal(worktreeId: string): Terminal {
  if (!cache.has(worktreeId)) {
    const t = new Terminal({ allowProposedApi: true, theme: THEME })
    t.loadAddon(new WebglAddon())
    t.loadAddon(new FitAddon())
    cache.set(worktreeId, t)
  }
  return cache.get(worktreeId)!
}

export function disposeTerminal(worktreeId: string): void {
  cache.get(worktreeId)?.dispose()
  cache.delete(worktreeId)
}
```

**2.5 — Rewrite `renderer/components/Terminal.tsx`**
- Accept `worktreeId` prop only
- On mount: call `terminalCache.getOrCreateTerminal(worktreeId)`, attach to container div if not already attached (`terminal.open(containerRef.current)`)
- **Visibility toggle**: use `display: none` / `display: block` via CSS, NOT mount/unmount — wrap all worktree terminals in a parent div, show only active one
- On `worktreeId` change: hide old container, show new container — do NOT dispose terminal
- `ResizeObserver` with `debounce(50ms)` calling `fitAddon.fit()`
- Data flow: `window.claudetreeBridge.terminal.onData(worktreeId, (data) => terminal.write(data))` — pass `Uint8Array` directly
- User input: `terminal.onData((input) => window.claudetreeBridge.terminal.write(sessionId, input))`
- Cleanup on component unmount: unsubscribe IPC listener only — do NOT close PTY

**2.6 — Remove PTY code from backend**
Delete `src/pty.ts` (or equivalent) from the Express backend. Remove any WS terminal relay code. Backend is now pure REST.

### Testing Checkpoint
- Open terminal for worktree A, type commands, switch to worktree B, switch back to A — scrollback intact, session alive
- Kill backend subprocess — terminals continue working
- Restart backend — terminals still alive, app reconnects REST
- UTF-8 characters and ANSI colors render correctly (no corruption)
- Resize window — terminal reflows correctly after 50ms debounce

---

## Phase 3: UI Rebuild (3–4 days)

**Goal:** Three Zustand stores wired, WebSocket reconnect, connection state visible, optimistic mutations.

### Tasks

**3.1 — Create `renderer/stores/connectionStore.ts`**
```typescript
interface PendingRequest {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const useConnectionStore = create<ConnectionStore>((set, get) => ({
  state: 'connecting',
  pendingRequests: new Map(),
  setState: (s) => set({ state: s }),
  // methods for request tracking
}))
```

**3.2 — Create `renderer/lib/wsTransport.ts`**
WebSocket transport with reconnect state machine:
- States: `connecting → open → reconnecting → closed`
- On close/error: wait exponential backoff (1s, 2s, 4s, max 30s), attempt reconnect
- On reconnect: re-request `server.welcome` to resync state
- Update `connectionStore.state` on each transition
- Parse incoming messages as typed envelopes: `{ type: string, seq: number, payload: unknown }`
- Sequence tracking: warn on gaps, do NOT drop events (log and continue)
- Use `window.claudetreeBridge.getBackendUrl()` for URL — NOT `window.location.host`

**3.3 — Create `renderer/lib/ipcBootstrap.ts`**
On app start:
1. Call `ipcBridge.listProjects()` and `ipcBridge.listWorktrees()`
2. Populate `appStore` via `setFromWelcome()`
3. Set `connectionStatus: 'open'`
4. Subscribe to push events from wsTransport for live updates
- Gate: do NOT render main UI until bootstrap complete (show skeleton/spinner)

**3.4 — Rewrite `renderer/App.tsx`**
- Call `ipcBootstrap.init()` on mount
- Render `<ConnectionBanner />` always (top of layout)
- Render main layout only when `connectionStatus !== 'connecting'`
- Wrap with store providers (Zustand stores are singletons, no Provider needed — but set up any context)
- Remove old fetch-on-mount patterns

**3.5 — Rewrite `renderer/components/Sidebar.tsx`**
- Subscribe to `useAppStore(s => s.projects)` and `useAppStore(s => s.worktrees)`
- Subscribe to `useUIStore` for selection state
- Project click: `uiStore.selectProject(id)` — no fetch
- Worktree click: `uiStore.selectWorktree(id)` — no fetch
- Show `<WorktreeStatusDot />` per worktree
- Optimistic delete: remove from local list immediately, rollback on error
- No local state for projects/worktrees — all from stores

**3.6 — Create `renderer/components/ConnectionBanner.tsx`**
```typescript
export function ConnectionBanner() {
  const state = useConnectionStore(s => s.state)
  if (state === 'open') return null
  return (
    <div className={`connection-banner connection-banner--${state}`}>
      {state === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
    </div>
  )
}
```
Fixed position, top of screen, animates in/out.

**3.7 — Create `renderer/components/WorktreeStatusDot.tsx`**
Visual indicator per worktree: `idle | pending | error`. Reads from `appStore` worktree state field.

**3.8 — Fix remaining bugs**
- `loadProjects` stale closure: move to store action, no closure over stale state
- Binary PTY data: ensure `Uint8Array` path end-to-end (covered in Phase 2 but verify here)
- Add error boundaries around Terminal and Sidebar
- Add per-operation error toasts (use existing shadcn toast if present)

### Testing Checkpoint
- Kill and restart backend — ConnectionBanner shows "Reconnecting...", then disappears when reconnected
- Switch worktrees rapidly — no redundant fetches in Network tab (DevTools)
- Delete worktree — list updates immediately (optimistic), not after server round-trip
- Connection banner visible in all disconnected states
- No `window.location.host` references remain in codebase (`grep -r "location.host" src/`)

---

## Phase 4: Polish & Packaging (2–3 days)

**Goal:** Auth on all routes, error surfacing complete, app packages and ships.

### Tasks

**4.1 — Auth middleware on all backend routes**
```typescript
// src/middleware/auth.ts
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token !== config.authToken) return res.status(401).json({ error: 'unauthorized' })
  next()
}
```
Apply to all routes. Apply to WebSocket upgrade: check token in query param or first message.

**4.2 — Backend healthz endpoint**
`GET /healthz` returns `{ status: 'ok', uptime: process.uptime() }`. Exempt from auth. Used by main process to verify backend started.

**4.3 — Graceful shutdown**
- Main process: on `app.before-quit`, call `ptyManager.closeAll()`, then kill backend subprocess
- Backend: handle `SIGTERM`, close server gracefully, flush any pending writes

**4.4 — Error surfacing audit**
Walk every IPC handler and REST call in the renderer. Each must have:
- Try/catch with typed error
- Error propagated to store or local state
- UI shows toast or inline error (not silent failure)
Use `grep -r "catch" src/renderer` to find gaps.

**4.5 — Keyboard navigation**
Verify existing keyboard shortcuts work. Add:
- `Cmd+K` — focus worktree search/filter
- `Cmd+T` — new worktree modal
- Arrow keys navigate worktree list

**4.6 — electron-builder config**
`apps/desktop/electron-builder.yml`:
```yaml
appId: com.claudetree.app
productName: claudetree
directories:
  output: dist
mac:
  category: public.app-category.developer-tools
  target: [dmg, zip]
files:
  - dist/**/*
  - node_modules/**/*
extraResources:
  - from: ../../node_modules/.bin/claude
    to: bin/claude
    filter: ['**/*']
```

**4.7 — CLAUDE.md for the repo**
Create `CLAUDE.md` at repo root (see Claude Code Agent Instructions section below).

**4.8 — Write unit tests for ordering-critical code**
- `worktreeRegistry.test.ts`: stable ID, persist/load round-trip, concurrent mutation safety
- `worktreeWorker.test.ts`: queue ordering (create → delete same worktree), error handling
- `asyncQueue.test.ts`: enqueue order preserved, rejected jobs don't block queue

### Testing Checkpoint
- `npm run build && npm run dist` produces a working `.dmg`
- Fresh install on a machine with no prior claudetree data — app starts, `claude` found
- All routes return 401 without auth token
- Trigger a backend error (bad git path) — error toast appears in UI, app doesn't crash
- Close app mid-worktree-create — on restart, worktree is either fully created or absent (no partial state)

---

## Migration Risks (Top 5)

### Risk 1: PTY environment mismatch — `claude` CLI not found
**Severity:** Critical. Blocks all terminal functionality.
**Cause:** macOS GUI apps launch with minimal PATH. `claude` installed via npm/brew won't be on it.
**Mitigation:** `syncShellEnvironment.ts` runs at startup before anything else, spawning a login shell to capture full PATH. Add hard failure with user-facing error dialog if `claude` not found — do not silently degrade. Test this on a fresh macOS user account, not just dev machine.

### Risk 2: Stable ID collisions or regressions
**Severity:** High. Breaks terminal session continuity after restart.
**Cause:** Switching from random UUIDs to SHA-of-path stable IDs. Existing users have old UUIDs in state (if any).
**Mitigation:** Migration script in `worktreeRegistry.ts` startup: if `worktrees.json` absent, scan git worktrees from each known project path and reconstruct registry with stable IDs. No backward compatibility needed for v1 (no existing users). Document the ID scheme clearly.

### Risk 3: IPC latency under heavy terminal I/O
**Severity:** Medium. PTY in main process sends data events to renderer via `webContents.send()`.
**Cause:** High-throughput terminal output (e.g., `cat large-file`) floods IPC. Electron IPC is not designed for high-frequency small messages.
**Mitigation:** Batch PTY data before sending: accumulate data for 8ms, then send as single `Buffer`. Implement in `ptyManager.ts` with a per-session flush timer. If still problematic, consider SharedArrayBuffer for raw data (advanced, defer).

### Risk 4: WorktreeWorker queue doesn't handle backend restart
**Severity:** Medium. Queue lives in main process (good), but git ops need git binary accessible.
**Cause:** If user's PATH changes between queue enqueue and dequeue.
**Mitigation:** Shell env is captured once at startup and frozen into `process.env`. All child processes inherit this. Queue drain is synchronous per job — no async gap where env could change. Acceptable risk.

### Risk 5: Frontend store bootstrap race
**Severity:** Medium. If `ipcBootstrap.init()` is slow, UI renders before data arrives.
**Cause:** `listProjects()` and `listWorktrees()` are async IPC calls on startup.
**Mitigation:** Gate main UI render on `connectionStatus !== 'connecting'`. Show skeleton loading state (shadcn already has this). Ensure `ipcBootstrap.init()` completes before setting status to `open`. If IPC call fails, surface error and offer retry — do not hang forever.

---

## Claude Code Agent Instructions

### CLAUDE.md (write to repo root)

```markdown
# claudetree — Claude Code Context

## Architecture
Electron desktop app. Three processes:
1. **Main process** (`apps/desktop/src/main.ts`) — owns PTY sessions (ptyManager.ts), worktree queue (worktreeWorker.ts), registry persistence
2. **Backend subprocess** (`src/`) — Express REST only, no PTY, receives config via fd3 bootstrap pipe
3. **Renderer** (`apps/desktop/src/renderer/`) — React + Zustand, IPC via contextBridge, xterm.js

## Critical Rules
- PTY sessions NEVER live in the backend — they live in main process only
- Worktree IDs are SHA-256 of absolute path (first 16 hex chars), never random UUIDs
- All worktree mutations go through WorktreeWorker.enqueue() — never call git directly from IPC handlers
- Terminal data is Uint8Array end-to-end — never cast to string
- Terminal xterm instances are cached in terminalCache.ts — never destroy on tab switch
- No Effect.ts — reimplement patterns in plain TypeScript

## IPC Channels
See `apps/desktop/src/ipcChannels.ts` for all channel name constants.

## Key Files
- `syncShellEnvironment.ts` — must run before app.whenReady()
- `ptyManager.ts` — all node-pty usage
- `worktreeWorker.ts` — all git worktree operations
- `worktreeRegistry.ts` — persistence layer
- `renderer/stores/` — appStore, uiStore, connectionStore
- `renderer/lib/terminalCache.ts` — xterm instance lifecycle
```

### Phase Prompts for Claude Code Agent

**Phase 0 prompt:**
> "Implement the Electron bootstrap infrastructure for claudetree. Files to create: `apps/desktop/src/ipcChannels.ts` (channel name constants), `apps/desktop/src/syncShellEnvironment.ts` (login shell env capture using execFileSync), `apps/desktop/src/bootstrapPipe.ts` (reserveLoopbackPort, generateAuthToken, writeBootstrapToFd3). Rewrite `apps/desktop/src/main.ts` to call syncShellEnvironment(), get dynamic port, spawn backend with fd3 pipe, wait for READY on stdout before showing window. Create `apps/desktop/src/preload.ts` with contextBridge exposing claudetreeBridge. Update `src/index.ts` to read fd3 bootstrap JSON, use dynamic port, verify auth token, write READY to stdout. Do not touch any renderer files yet. Reference: CLAUDE.md in repo root."

**Phase 1 prompt:**
> "Implement worktree persistence and queued operations for claudetree. Create `apps/desktop/src/worktreeRegistry.ts` (WorktreeRegistry class, stableId function, JSON persistence to dataDir). Create `apps/desktop/src/worktreeWorker.ts` (AsyncQueue generic, WorktreeWorker with processCreate/processDelete using execFile not shell). Create `apps/desktop/src/projectRegistry.ts` (same pattern as worktreeRegistry). Register IPC handlers in main.ts for CT_WORKTREE_* and CT_PROJECT_*. Create `renderer/stores/appStore.ts`, `renderer/stores/uiStore.ts`. Fix stale closure bug in project loading — move fetch logic into store action. Do not touch terminal code. Reference: CLAUDE.md."

**Phase 2 prompt:**
> "Move PTY management to Electron main process for claudetree. Create `apps/desktop/src/ptyManager.ts` (PtyManager class with state machine: idle→spawning→ready→running→crashed→recovering, uses node-pty, pushes data to renderer via webContents.send with 8ms batching). Register CT_TERMINAL_* IPC handlers in main.ts. Update preload.ts to add terminal bridge (onData, onExit listeners, write/resize/close). Create `renderer/lib/terminalCache.ts` (xterm instance cache, getOrCreateTerminal, disposeTerminal). Rewrite `renderer/components/Terminal.tsx` — use CSS visibility toggle (not mount/unmount) to preserve scrollback, attach xterm to DOM ref, ResizeObserver with 50ms debounce, IPC not WebSocket for data. Delete PTY code from `src/pty.ts`. Reference: CLAUDE.md."

**Phase 3 prompt:**
> "Rebuild claudetree frontend state management and connection handling. Create `renderer/stores/connectionStore.ts` (transport state machine). Create `renderer/lib/wsTransport.ts` (WebSocket with exponential backoff reconnect, typed envelope parsing, uses claudetreeBridge.getBackendUrl() not window.location.host). Create `renderer/lib/ipcBootstrap.ts` (init stores from IPC on startup, set connectionStatus). Rewrite `renderer/App.tsx` (call ipcBootstrap.init, gate render on connectionStatus, add ConnectionBanner). Rewrite `renderer/components/Sidebar.tsx` (subscribe to appStore, optimistic delete with rollback). Create `renderer/components/ConnectionBanner.tsx`. Create `renderer/components/WorktreeStatusDot.tsx`. Add error toasts to all IPC calls. Do not touch FeaturesTab, ReviewTab, DiffViewer, CommitPanel. Reference: CLAUDE.md."

**Phase 4 prompt:**
> "Polish and package claudetree. Add auth middleware to all Express routes in `src/middleware/auth.ts` and apply it. Add `GET /healthz` route (no auth). Add graceful shutdown in main.ts (ptyManager.closeAll() before quit). Audit all IPC calls in renderer for missing error handling — each must have try/catch with toast. Add keyboard shortcuts: Cmd+K focus filter, Cmd+T new worktree modal. Create `apps/desktop/electron-builder.yml`. Write unit tests: `worktreeRegistry.test.ts`, `worktreeWorker.test.ts`, `asyncQueue.test.ts`. Verify `npm run dist` produces working .dmg. Reference: CLAUDE.md."

### Context Files to Include Per Phase
- All phases: `CLAUDE.md`, `apps/desktop/src/ipcChannels.ts`
- Phase 1+: `apps/desktop/src/worktreeRegistry.ts` (for ID scheme)
- Phase 2+: `apps/desktop/src/ptyManager.ts`
- Phase 3+: `renderer/stores/appStore.ts`, `renderer/lib/terminalCache.ts`
- Phase 4: All of the above + `src/index.ts`
