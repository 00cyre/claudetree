# claudetree → Electron: Frontend Migration Plan

**Author:** IRIS  
**Date:** 2026-04-04  
**Source refs:** `~/claudetree/frontend/src/`, `/tmp/t3code/apps/web/src/`

---

## 1. Current UI Pain Points

### 1.1 Terminal destroys itself on every worktree switch

`useTerminal` runs its entire setup/teardown inside `useEffect([worktreeId, containerRef])`. Change the selected worktree → the xterm instance is disposed, the WebSocket is closed, and a brand new terminal is created from scratch. Scrollback is gone. Any running process is killed. The flash is jarring.

There's also no instance cache: if you switch A → B → A, you've now created three separate terminal sessions. Users expect terminals to persist like tabs, not restart on click.

### 1.2 WebSocket reconnect: there is none

```ts
ws.onclose = () => {
  term.write('\r\n[Session ended]\r\n');
};
```

When the backend restarts or the network hiccups, the terminal just dies. No retry, no reconnection banner, no anything. The user has to select a different worktree and back to get a new session. This is unacceptable.

### 1.3 Resize spam with no debounce

```ts
const handleResize = () => fitAddon.fit();
window.addEventListener('resize', handleResize);
```

`fitAddon.fit()` fires on every `resize` event, which means every pixel of window drag sends a PTY resize message. At 60fps resizing you're flooding the backend. No debounce, no RAF batching.

### 1.4 `loadProjects` re-creates itself when `selectedProject` changes

```ts
const loadProjects = useCallback(async () => {
  const data = await api.getProjects();
  setProjects(data);
  if (data.length > 0 && !selectedProject) { // <-- captures selectedProject
    setSelectedProject(data[0]);
  }
}, [selectedProject]); // <-- changes when selectedProject changes
```

This means `loadProjects` is a new function every time `selectedProject` changes. Since `useEffect([loadProjects])` depends on it, this re-fetches all projects whenever the user clicks a project. On every project switch the whole list reloads. It's subtle but causes visible flicker and redundant API calls.

### 1.5 No error state is surfaced anywhere

`useWorktrees` has `console.error(...)` calls and swallows failures completely. If `createWorktree` throws, nothing in the UI changes. No toast, no error message, no retry button. Silent failure.

### 1.6 Delete is not optimistic

```ts
const deleteWorktree = async (id: string) => {
  await api.deleteWorktree(id); // waits for server
  setWorktrees(prev => prev.filter(w => w.id !== id)); // then removes from UI
};
```

The sidebar item stays visible (and clickable!) while the delete is in-flight. If the server is slow the user can click delete twice. No pending state, no visual feedback.

### 1.7 The `loading` flag is too coarse

`loading` covers the entire worktree list fetch. There's no per-worktree loading state, no skeleton UI, no distinction between "initial load" and "refreshing". The sidebar just shows a generic "Loading..." string.

### 1.8 State is entangled in a single hook

`useWorktrees` mixes data fetching, server sync, and selection state in one blob. This makes it impossible to:
- Subscribe to worktree updates independently of selection
- Share worktree data between two components without prop drilling
- Test state transitions without simulating the entire hook lifecycle

### 1.9 Binary PTY output will corrupt

```ts
ws.onmessage = (event) => {
  term.write(event.data as string); // assumes string
};
```

PTY output is binary. `event.data` may be a `Blob` or `ArrayBuffer`. Casting it to string and writing it to xterm will produce garbage for any non-ASCII output (colors, box-drawing, etc.) unless the backend is specifically serializing everything as UTF-8 strings.

### 1.10 URL construction is hardcoded to browser environment

```ts
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}/terminal/${worktreeId}`);
```

In Electron there is no `window.location.host`. This code crashes immediately.

---

## 2. State Management Redesign

### The Problem

The current pattern:

```
App.tsx (owns useWorktrees state)
  └── Sidebar (receives 9 props)
  └── FeaturesTab → TerminalView (receives worktreeId, fetches its own ws)
```

Everything flows down. Selection is in the same object as data. Fetches are co-located with renders. There's no separation between "what the server told us" and "what the user has clicked".

### The Model (inspired by t3code's store.ts + terminalStateStore.ts)

Split into three stores:

```
appStore          — server-side truth: projects, worktrees, claude sessions
uiStore           — pure UI state: selected project, selected worktree, open modals
connectionStore   — IPC/WebSocket transport state: connected, reconnecting, error
```

Each is a Zustand store with pure reducer functions, matching t3code's approach exactly.

### Before

```ts
// useWorktrees.ts — god hook, everything mixed together
export function useWorktrees() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  // ... etc
  
  const loadProjects = useCallback(async () => {
    const data = await api.getProjects();
    setProjects(data);
    if (data.length > 0 && !selectedProject) { // stale closure bug
      setSelectedProject(data[0]);
    }
  }, [selectedProject]); // triggers re-fetch on selection change
```

### After

**`src/store/appStore.ts`** — server state only, pure transitions:

```ts
import { create } from 'zustand';
import type { Project, Worktree, WorktreeStatus } from '../types';

export interface AppState {
  projects: Project[];
  worktreesByProjectId: Record<string, Worktree[]>;
  bootstrapComplete: boolean;
}

// Pure state transition functions (testable without React)
export function applyProjectsLoaded(state: AppState, projects: Project[]): AppState {
  return { ...state, projects, bootstrapComplete: true };
}

export function applyWorktreeCreated(
  state: AppState,
  projectId: string,
  worktree: Worktree,
): AppState {
  const existing = state.worktreesByProjectId[projectId] ?? [];
  // Deduplicate by id
  if (existing.some(w => w.id === worktree.id)) return state;
  return {
    ...state,
    worktreesByProjectId: {
      ...state.worktreesByProjectId,
      [projectId]: [...existing, worktree],
    },
  };
}

export function applyWorktreeDeleted(state: AppState, id: string): AppState {
  const next: Record<string, Worktree[]> = {};
  let changed = false;
  for (const [pid, wts] of Object.entries(state.worktreesByProjectId)) {
    const filtered = wts.filter(w => w.id !== id);
    next[pid] = filtered;
    if (filtered.length !== wts.length) changed = true;
  }
  return changed ? { ...state, worktreesByProjectId: next } : state;
}

// Zustand store
interface AppStore extends AppState {
  syncProjects: (projects: Project[]) => void;
  worktreeCreated: (projectId: string, worktree: Worktree) => void;
  worktreeDeleted: (id: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  projects: [],
  worktreesByProjectId: {},
  bootstrapComplete: false,
  syncProjects: (projects) => set((s) => applyProjectsLoaded(s, projects)),
  worktreeCreated: (projectId, worktree) =>
    set((s) => applyWorktreeCreated(s, projectId, worktree)),
  worktreeDeleted: (id) => set((s) => applyWorktreeDeleted(s, id)),
}));
```

**`src/store/uiStore.ts`** — selection and UI-only state:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  selectedProjectId: string | null;
  selectedWorktreeId: string | null;
  activeTab: 'features' | 'review';
  showNewWorktreeModal: boolean;
  pendingDeleteIds: Set<string>; // optimistic delete tracking
}

interface UiStore extends UiState {
  selectProject: (id: string) => void;
  selectWorktree: (id: string | null) => void;
  setTab: (tab: 'features' | 'review') => void;
  setShowModal: (show: boolean) => void;
  markPendingDelete: (id: string) => void;
  clearPendingDelete: (id: string) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      selectedWorktreeId: null,
      activeTab: 'features',
      showNewWorktreeModal: false,
      pendingDeleteIds: new Set(),
      selectProject: (id) =>
        set({ selectedProjectId: id, selectedWorktreeId: null }),
      selectWorktree: (id) => set({ selectedWorktreeId: id }),
      setTab: (tab) => set({ activeTab: tab }),
      setShowModal: (show) => set({ showNewWorktreeModal: show }),
      markPendingDelete: (id) =>
        set((s) => ({ pendingDeleteIds: new Set([...s.pendingDeleteIds, id]) })),
      clearPendingDelete: (id) =>
        set((s) => {
          const next = new Set(s.pendingDeleteIds);
          next.delete(id);
          return { pendingDeleteIds: next };
        }),
    }),
    {
      name: 'claudetree:ui',
      partialize: (s) => ({
        selectedProjectId: s.selectedProjectId,
        selectedWorktreeId: s.selectedWorktreeId,
        activeTab: s.activeTab,
      }),
    },
  ),
);
```

**`src/store/connectionStore.ts`** — IPC transport state:

```ts
import { create } from 'zustand';

export type ConnectionStatus =
  | { phase: 'disconnected' }
  | { phase: 'connecting' }
  | { phase: 'connected'; since: number }
  | { phase: 'reconnecting'; attempt: number; nextRetryAt: number }
  | { phase: 'error'; message: string };

interface ConnectionStore {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: { phase: 'disconnected' },
  setStatus: (status) => set({ status }),
}));
```

### Commands (actions that call the main process)

Replace the `api` client with typed IPC commands in `src/ipc/commands.ts`:

```ts
// In Electron, window.electronBridge is injected by the preload script
export async function createWorktree(projectId: string, name: string): Promise<Worktree> {
  return window.electronBridge.invoke('worktree:create', { projectId, name });
}

export async function deleteWorktree(id: string): Promise<void> {
  return window.electronBridge.invoke('worktree:delete', { id });
}
```

And in components, actions are now explicit and optimistic:

```ts
// Before: mutation buried in hook
const deleteWorktree = async (id: string) => {
  await api.deleteWorktree(id);     // blocks
  setWorktrees(prev => prev.filter(w => w.id !== id));
};

// After: optimistic with rollback
async function handleDelete(id: string) {
  uiStore.markPendingDelete(id);         // immediately grey out
  appStore.worktreeDeleted(id);          // immediately remove from list
  try {
    await deleteWorktree(id);            // confirm with main process
  } catch (err) {
    appStore.worktreeCreated(projectId, worktree); // rollback
    uiStore.clearPendingDelete(id);
    showToast(`Delete failed: ${err.message}`);
  }
}
```

---

## 3. Terminal Overhaul

### What's Wrong With the Current Approach

**Problem 1: WebSocket + browser = impedance mismatch**

The current flow:
```
xterm.js (renderer) ↔ WebSocket ↔ HTTP server ↔ node-pty (server process)
```

Every keystroke goes: renderer → WebSocket frame → server → pty write. PTY output goes: pty → server → WebSocket frame → renderer → xterm.write(). That's 4 hops for input, 4 hops for output. In a browser this is the only option. In Electron it's unnecessary.

**Problem 2: Terminals re-mount on worktree switch**

```ts
useEffect(() => {
  // entire terminal setup lives here
  // worktreeId in deps = full teardown on switch
}, [worktreeId, containerRef]);
```

Every time you switch worktrees, the terminal is destroyed. Scrollback is lost. The PTY session on the backend is closed (assuming `ws.close()` in cleanup triggers cleanup server-side). This is the single biggest UX regression compared to any real terminal emulator.

**Problem 3: No reconnect**

```ts
ws.onclose = () => {
  term.write('\r\n[Session ended]\r\n');
};
```

Dead. The session is toast. User must manually trigger a new one.

**Problem 4: Binary data**

PTY output is binary (`Uint8Array`). `event.data as string` is a lie. Colors, UTF-8, box-drawing — all potentially corrupted depending on how the backend serializes.

### The Electron IPC Model

In Electron, the main process can spawn `node-pty` directly. The renderer talks to it over IPC:

```
xterm.js (renderer) ↔ ipcRenderer/ipcMain ↔ node-pty (main process)
```

2 hops. Zero network. Zero serialization overhead for the hot path.

**Main process (`src/main/pty.ts`):**

```ts
import * as pty from 'node-pty';
import { ipcMain } from 'electron';

const sessions = new Map<string, pty.IPty>();

ipcMain.handle('terminal:open', (_, { id, cwd }) => {
  if (sessions.has(id)) return; // already running
  const proc = pty.spawn(process.env.SHELL ?? 'bash', [], {
    name: 'xterm-256color',
    cwd,
    cols: 80,
    rows: 24,
    env: process.env,
  });
  sessions.set(id, proc);

  proc.onData((data) => {
    // Push to renderer — this is the hot path, no serialization
    mainWindow.webContents.send(`terminal:data:${id}`, data);
  });

  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    mainWindow.webContents.send(`terminal:exit:${id}`, { exitCode });
  });
});

ipcMain.handle('terminal:write', (_, { id, data }) => {
  sessions.get(id)?.write(data);
});

ipcMain.handle('terminal:resize', (_, { id, cols, rows }) => {
  sessions.get(id)?.resize(cols, rows);
});

ipcMain.handle('terminal:close', (_, { id }) => {
  sessions.get(id)?.kill();
  sessions.delete(id);
});
```

**Renderer hook (`src/hooks/useTerminalIpc.ts`):**

```ts
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// Terminal instances survive component unmounts — keyed by worktreeId
const terminalCache = new Map<string, {
  term: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement | null;
}>();

export function useTerminalIpc(
  worktreeId: string | null,
  cwd: string | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const attachedId = useRef<string | null>(null);

  useEffect(() => {
    if (!worktreeId || !cwd || !containerRef.current) return;
    const container = containerRef.current;

    // Reuse or create the terminal instance
    let entry = terminalCache.get(worktreeId);
    if (!entry) {
      const term = new Terminal({
        theme: { background: '#1a1a2e', foreground: '#e0e0e0', cursor: '#e0e0e0' },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        cursorBlink: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      entry = { term, fitAddon, container: null };
      terminalCache.set(worktreeId, entry);

      // Open the PTY in the main process
      window.electronBridge.invoke('terminal:open', { id: worktreeId, cwd });
    }

    const { term, fitAddon } = entry;

    // Re-attach to this DOM container
    if (entry.container !== container) {
      // xterm requires re-open if container changed
      term.open(container);
      entry.container = container;
    }
    fitAddon.fit();
    attachedId.current = worktreeId;

    // IPC data listener
    const removeDataListener = window.electronBridge.on(
      `terminal:data:${worktreeId}`,
      (data: string) => term.write(data),
    );

    // IPC exit listener
    const removeExitListener = window.electronBridge.on(
      `terminal:exit:${worktreeId}`,
      ({ exitCode }: { exitCode: number }) => {
        term.write(`\r\n[Process exited with code ${exitCode}]\r\n`);
        terminalCache.delete(worktreeId);
      },
    );

    // User input → main process
    const inputDispose = term.onData((data) => {
      window.electronBridge.invoke('terminal:write', { id: worktreeId, data });
    });

    // Resize with debounce
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        window.electronBridge.invoke('terminal:resize', {
          id: worktreeId,
          cols: term.cols,
          rows: term.rows,
        });
      }, 50);
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    return () => {
      // DON'T dispose the terminal — just detach listeners
      removeDataListener();
      removeExitListener();
      inputDispose.dispose();
      resizeObs.disconnect();
      clearTimeout(resizeTimer);
      attachedId.current = null;
    };
  }, [worktreeId, cwd]); // containerRef intentionally omitted — stable ref

  // Cleanup when the worktree is actually deleted
  function destroyTerminal(id: string) {
    const entry = terminalCache.get(id);
    if (entry) {
      entry.term.dispose();
      terminalCache.delete(id);
    }
    window.electronBridge.invoke('terminal:close', { id });
  }

  return { destroyTerminal };
}
```

Key improvements:
- **Terminal instances are cached** — switching worktrees doesn't destroy the terminal
- **node-pty lives in the main process** — no WebSocket, direct IPC
- **ResizeObserver** replaces window resize event — terminal-specific, not global
- **Debounced resize** — 50ms timeout, not every pixel
- **Explicit destroy** — only called when a worktree is actually deleted
- **No URL construction** — `window.electronBridge` is injected by preload

---

## 4. New UI Structure

### Component Tree (Electron Renderer)

```
App
├── ConnectionBanner         [NEW] — shows reconnecting/error state
├── Header
│   ├── Logo
│   └── TabBar
├── MainLayout
│   ├── Sidebar              [REWRITE]
│   │   ├── ProjectSelector
│   │   ├── WorktreeList
│   │   │   └── WorktreeItem [REWRITE — status dots, pending state]
│   │   └── AddWorktreeButton
│   └── ContentArea
│       ├── FeaturesTab      [KEEP — mostly fine]
│       │   ├── TerminalPane [REWRITE — uses useTerminalIpc]
│       │   └── ClaudePane
│       └── ReviewTab        [KEEP]
└── NewWorktreeModal         [KEEP — minor improvements]
```

### What to Keep

- `FeaturesTab.tsx` / `ReviewTab.tsx` — layout is fine, just needs store connections instead of props
- `NewWorktreeModal.tsx` — works as-is, just wire to store actions
- CSS — keep it, minor additions needed

### What to Rewrite

**`App.tsx`** — Stop threading props through the component tree. Components read from stores directly.

```tsx
// Before: 9-prop Sidebar
<Sidebar
  projects={projects}
  selectedProject={selectedProject}
  onSelectProject={setSelectedProject}
  worktrees={worktrees}
  selectedWorktree={selectedWorktree}
  onSelectWorktree={setSelectedWorktree}
  onNewWorktree={() => setShowModal(true)}
  onDeleteWorktree={deleteWorktree}
  loading={loading}
/>

// After: Sidebar reads its own state
<Sidebar />  // connects to useAppStore, useUiStore internally
```

**`Sidebar.tsx`** — Rewrite to connect to stores, add status indicators:

```tsx
export function Sidebar() {
  const projects = useAppStore(s => s.projects);
  const worktrees = useAppStore(s => {
    const pid = useUiStore.getState().selectedProjectId;
    return pid ? s.worktreesByProjectId[pid] ?? [] : [];
  });
  const { selectedProjectId, selectedWorktreeId, pendingDeleteIds } = useUiStore();
  
  // ... render with per-item pending state
  return (
    <aside className="sidebar">
      <ProjectSelector />
      <WorktreeList
        worktrees={worktrees}
        selectedId={selectedWorktreeId}
        pendingDeleteIds={pendingDeleteIds}
        onSelect={uiStore.selectWorktree}
        onDelete={handleDelete}
      />
    </aside>
  );
}
```

**`Terminal.tsx`** — Rewrite to use the IPC hook and cached instances:

```tsx
export function TerminalPane({ worktreeId, cwd }: { worktreeId: string | null; cwd: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTerminalIpc(worktreeId, cwd, containerRef);

  return (
    <div className="terminal-wrapper">
      {!worktreeId && <div className="terminal-placeholder">Select a worktree</div>}
      <div
        className="terminal-container"
        ref={containerRef}
        style={{ display: worktreeId ? 'block' : 'none' }}
      />
    </div>
  );
}
```

Note the `display: none` trick — keep the container in DOM so xterm doesn't need re-mounting, just hide it.

### What to Add

**`ConnectionBanner.tsx`** — connection state indicator:

```tsx
export function ConnectionBanner() {
  const status = useConnectionStore(s => s.status);
  if (status.phase === 'connected') return null;
  
  return (
    <div className={`connection-banner connection-banner--${status.phase}`}>
      {status.phase === 'connecting' && '⟳ Connecting to backend...'}
      {status.phase === 'reconnecting' && `⟳ Reconnecting (attempt ${status.attempt})...`}
      {status.phase === 'error' && `✕ ${status.message}`}
    </div>
  );
}
```

**`WorktreeStatusDot.tsx`** — per-worktree Claude session status:

```tsx
// Once Claude session state is in the store
export function WorktreeStatusDot({ worktreeId }: { worktreeId: string }) {
  const status = useAppStore(s => s.sessionsByWorktreeId[worktreeId]?.status ?? 'idle');
  return <span className={`status-dot status-dot--${status}`} title={status} />;
}
```

**`src/ipc/bootstrap.ts`** — connects IPC events to store actions on app start:

```ts
export function bootstrapIpcListeners() {
  // Main process pushes initial state on connect
  window.electronBridge.on('app:init', (data: AppInitPayload) => {
    useAppStore.getState().syncProjects(data.projects);
    // ... sync worktrees, sessions
    useConnectionStore.getState().setStatus({ phase: 'connected', since: Date.now() });
  });

  window.electronBridge.on('worktree:created', ({ projectId, worktree }) => {
    useAppStore.getState().worktreeCreated(projectId, worktree);
  });

  window.electronBridge.on('worktree:deleted', ({ id }) => {
    useAppStore.getState().worktreeDeleted(id);
    if (useUiStore.getState().selectedWorktreeId === id) {
      useUiStore.getState().selectWorktree(null);
    }
  });
}
```

---

## 5. Responsiveness Fixes

### 5.1 Optimistic updates everywhere

Never wait for the server before updating the UI. The pattern:

```ts
// Pattern: optimistic-first, server-confirm, rollback on failure
async function handleDeleteWorktree(worktree: Worktree) {
  // 1. Snapshot for rollback
  const snapshot = useAppStore.getState();
  
  // 2. Optimistic update immediately
  useAppStore.getState().worktreeDeleted(worktree.id);
  useUiStore.getState().markPendingDelete(worktree.id);
  if (useUiStore.getState().selectedWorktreeId === worktree.id) {
    useUiStore.getState().selectWorktree(null);
  }
  
  // 3. Confirm with main process
  try {
    await window.electronBridge.invoke('worktree:delete', { id: worktree.id });
  } catch (err) {
    // 4. Rollback
    useAppStore.setState(snapshot);
    useUiStore.getState().clearPendingDelete(worktree.id);
    showToast({ type: 'error', message: `Delete failed: ${err.message}` });
  } finally {
    useUiStore.getState().clearPendingDelete(worktree.id);
  }
}
```

Apply same pattern to `createWorktree`: generate a temp ID client-side, insert optimistically, replace with real ID from server response.

### 5.2 Skeleton loading, not spinners

Replace the generic "Loading..." text in the sidebar with skeleton items:

```tsx
// Instead of:
{loading ? <div className="sidebar-empty">Loading...</div> : <WorktreeList />}

// Do:
{!bootstrapComplete ? (
  <SkeletonWorktreeList count={3} />
) : worktrees.length === 0 ? (
  <EmptyState message="No worktrees yet" action={<AddWorktreeButton />} />
) : (
  <WorktreeList worktrees={worktrees} />
)}
```

`SkeletonWorktreeList` renders CSS-animated placeholder rows that match the real list's geometry.

### 5.3 Connection state is always visible

The app currently has zero indication of whether it's connected to its backend. In Electron this matters — the main process might be slow to start, or could crash.

```tsx
// In App.tsx, always rendered:
<ConnectionBanner />

// WorktreeList items are non-interactive when disconnected:
<WorktreeItem
  disabled={connectionStatus.phase !== 'connected'}
  // ...
/>
```

### 5.4 Per-item pending states

When a delete is in-flight, make the item visually pending (not just greyed out):

```tsx
<li
  className={cn('worktree-item', {
    'worktree-item--active': isSelected,
    'worktree-item--pending': isPendingDelete,
  })}
  aria-busy={isPendingDelete}
>
  <span className="worktree-name">{wt.name}</span>
  {isPendingDelete ? (
    <Spinner size="sm" />
  ) : (
    <DeleteButton onClick={() => onDelete(wt)} />
  )}
</li>
```

CSS: `worktree-item--pending` adds `opacity: 0.5; pointer-events: none;` — item is visible but can't be double-clicked.

### 5.5 Bootstrap sequence with readiness gate

Inspired by t3code's `ServerReadiness` pattern: don't render the UI until the main process has pushed initial state. Show a full-screen loading state instead of a broken empty shell:

```tsx
export function App() {
  const bootstrapComplete = useAppStore(s => s.bootstrapComplete);
  const connectionStatus = useConnectionStore(s => s.status);

  if (!bootstrapComplete) {
    return <BootScreen status={connectionStatus} />;
  }

  return <MainLayout />;
}
```

`BootScreen` shows:
- Connecting spinner while `phase === 'connecting'`
- Error screen with retry button if `phase === 'error'`
- Brief "Initializing..." if connected but bootstrap not yet complete

### 5.6 Keyboard navigation

Currently zero keyboard support. Add at minimum:
- `↑/↓` to navigate worktree list
- `Enter` to select
- `Delete/Backspace` with confirmation to delete selected
- `Cmd+N` to open new worktree modal

This is a terminal-adjacent tool. Users expect to not need the mouse.

```ts
// In WorktreeList, add:
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') selectNext();
    if (e.key === 'ArrowUp') selectPrev();
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWorktreeId) {
      confirmDelete(selectedWorktreeId);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [selectedWorktreeId]);
```

---

## Summary: Migration Priority Order

| Priority | Work Item | Why |
|---|---|---|
| 1 | Terminal IPC + node-pty in main | Biggest UX bug, terminal is unusable |
| 2 | Zustand stores (appStore + uiStore) | Enables everything else, fixes re-fetch bug |
| 3 | IPC bootstrap listeners | State machine for connection + data sync |
| 4 | Optimistic delete/create | Eliminates perceptible lag on mutations |
| 5 | ConnectionBanner | Users need to know when app is unhealthy |
| 6 | Skeleton loading states | Eliminates jarring layout shifts |
| 7 | Keyboard navigation | Quality-of-life, expected in a dev tool |

The terminal fix (1) and store redesign (2) are the blockers. Everything else is incremental improvement that can ship after.
