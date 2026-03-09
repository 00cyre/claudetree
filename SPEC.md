# claudetree — Project Spec

## What is this?

A local web app that acts as a multi-instance Claude Code manager using git worktrees. Think of it as a workbench for feature development — each feature gets its own isolated worktree with its own Claude Code session and terminal.

## Architecture

```
claudetree/
├── frontend/     # Vite + React + TypeScript
├── backend/      # Express + Node.js + TypeScript
└── package.json  # root workspace
```

### Frontend
- **Vite + React + TypeScript**
- Two top-level tabs: **Features** | **Review**
- No external UI library needed — keep it minimal, dark theme

### Backend
- **Express + TypeScript**
- Handles: git worktree operations, file system access, spawning Claude Code, WebSocket terminal
- **node-pty** + **ws** for browser terminal
- **simple-git** for git operations

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  claudetree          [Features] [Review]             │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │   Main content area                      │
│          │                                          │
│ [+ New]  │   (terminal / diff view / commit panel)  │
│          │                                          │
│ feature1 │                                          │
│ feature2 │                                          │
│ feature3 │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

## Features Tab

### Sidebar
- Lists all active worktrees for the current project
- "New" button at the top
- Clicking a worktree opens it in the main area

### New Worktree Flow
1. User clicks "New"
2. Modal asks for: feature name, base repo path (or select from recent)
3. Backend creates a git worktree: `git worktree add <path>/<feature-name> -b <feature-name>`
4. Copies Claude Code config files from base repo into the new worktree:
   - `.claude/` directory
   - `CLAUDE.md` (if exists)
   - Any other config files at root level that Claude Code uses
5. Opens a new Claude Code instance inside that worktree
6. Shows a terminal (xterm.js) connected to that Claude Code process via WebSocket

### Terminal
- Full xterm.js terminal in the browser
- Connected to `node-pty` on the backend via WebSocket
- Each worktree gets its own pty session
- Claude Code runs inside the worktree directory

## Review Tab

### Left panel — File tree / changed files
- Shows all files changed in the selected worktree vs its base branch
- Expandable file list (same format as VSCode source control panel)

### Main area — Diff view
- Click a file → shows git diff in a side-by-side or unified diff format
- Syntax highlighted

### Right panel — Commit
- Staged / unstaged file list (checkboxes)
- Commit message input
- "Commit" button → runs `git commit` in the worktree
- Optional: push button

## Backend API

### REST endpoints
```
GET    /api/projects              → list configured projects
POST   /api/projects              → add a project (path on disk)
GET    /api/worktrees/:projectId  → list worktrees for a project
POST   /api/worktrees/:projectId  → create new worktree
DELETE /api/worktrees/:id         → remove worktree (git worktree remove)
GET    /api/diff/:worktreeId      → get changed files
GET    /api/diff/:worktreeId/:file → get diff for specific file
POST   /api/commit/:worktreeId    → commit staged changes
```

### WebSocket
```
ws://localhost:3001/terminal/:worktreeId
```
- Creates/attaches to a pty session for that worktree
- Streams stdin/stdout bidirectionally
- Claude Code is launched automatically on first connect: `claude` in the worktree dir

## Config files to copy on worktree init

When creating a new worktree, copy from the base repo:
- `.claude/` (entire directory)
- `CLAUDE.md`
- `.cursorrules` (if present)

## Key constraints

- **Never modify the main repo** — all work happens in worktrees
- Worktrees live inside the base repo at `.worktrees/<feature-name>` or a configurable path
- One Claude Code process per worktree
- Pty sessions persist while the backend is running

## Dev setup

```bash
# Install deps
npm install

# Start backend
cd backend && npm run dev

# Start frontend (separate terminal)
cd frontend && npm run dev
```

Frontend runs on `localhost:5173`, backend on `localhost:3001`.

## Stack summary

| Layer | Tech |
|-------|------|
| Frontend | Vite, React, TypeScript |
| Styling | Plain CSS or CSS modules (no heavy UI lib) |
| Terminal | xterm.js + xterm-addon-fit |
| Backend | Express, TypeScript, tsx |
| Git ops | simple-git |
| Terminal pty | node-pty |
| WebSocket | ws |
| Config | JSON file in ~/.claudetree/ |
