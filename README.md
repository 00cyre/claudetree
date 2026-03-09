# claudetree

A local web app that manages multiple Claude Code instances via git worktrees. Each feature gets its own isolated worktree with its own Claude Code session and terminal.

## Dev Setup

```bash
# Install all dependencies
npm install

# Start backend (port 3001)
cd backend && npm run dev

# Start frontend (port 5173) — in a separate terminal
cd frontend && npm run dev
```

Or run both at once from the root:

```bash
npm run dev
```

## Architecture

- **Frontend** — Vite + React + TypeScript. Two tabs: Features (terminal per worktree) and Review (diff viewer + commit panel).
- **Backend** — Express + TypeScript. REST API for projects/worktrees/diff/commit. WebSocket terminal via node-pty.
- **Config** — stored at `~/.claudetree/config.json`

## Notes

- `node-pty` requires native compilation — make sure you have build tools installed (`xcode-select --install` on macOS)
- Worktrees are created inside the base repo at `.worktrees/<feature-name>` by default
- Claude Code is auto-launched when you open a terminal for a worktree
- The worktree registry is in-memory only — restarting the backend rescans from git
