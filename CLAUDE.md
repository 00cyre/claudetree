# claudetree — Claude Code Context

## Architecture
Electron desktop app. Three processes:
1. **Main process** (`apps/desktop/src/main.ts`) — owns PTY sessions (ptyManager.ts), worktree queue (worktreeWorker.ts), registry persistence
2. **Backend subprocess** (`backend/src/`) — Express REST only, no PTY, receives config via fd3 bootstrap pipe
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
