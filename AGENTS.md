# AGENTS.md — Instructions for Claude Code

You are building **claudetree** — a local web app that manages multiple Claude Code instances via git worktrees.

## Read first

Read `SPEC.md` for the full project specification before doing anything.

## Your task

Scaffold and implement the full project according to the spec. Work incrementally:

1. **Set up the monorepo structure** — root `package.json` with workspaces, tsconfig, etc.
2. **Backend first** — get the Express server running with all REST endpoints and WebSocket terminal
3. **Frontend second** — build the UI: tabs, sidebar, terminal, diff view, commit panel
4. **Wire it together** — make sure frontend talks to backend correctly

## Rules

- TypeScript everywhere — no plain JS files
- Keep it simple — no heavy UI frameworks, minimal dependencies
- Dark theme for the UI
- Never hardcode paths — use config
- Backend port: 3001, frontend port: 5173 (Vite default)
- Use ES modules (`"type": "module"`)

## File structure to create

```
claudetree/
├── package.json              # root workspace (workspaces: ["frontend", "backend"])
├── SPEC.md                   # already exists — the full spec
├── AGENTS.md                 # this file
├── README.md                 # brief description + dev setup instructions
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── App.css
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── FeaturesTab.tsx
│       │   ├── ReviewTab.tsx
│       │   ├── Terminal.tsx
│       │   ├── DiffViewer.tsx
│       │   ├── CommitPanel.tsx
│       │   └── NewWorktreeModal.tsx
│       ├── hooks/
│       │   ├── useWorktrees.ts
│       │   └── useTerminal.ts
│       ├── api/
│       │   └── client.ts     # fetch wrappers for all backend endpoints
│       └── types/
│           └── index.ts      # shared types
└── backend/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts          # Express app entry, WebSocket setup
        ├── config.ts         # load/save ~/.claudetree/config.json
        ├── routes/
        │   ├── projects.ts
        │   ├── worktrees.ts
        │   ├── diff.ts
        │   └── commit.ts
        └── terminal/
            └── pty.ts        # node-pty manager, one session per worktree
```

## When you're done

- Make sure `cd backend && npm run dev` starts the backend without errors
- Make sure `cd frontend && npm run dev` starts the frontend without errors
- Both should be able to run simultaneously
- Leave a note in the README about anything incomplete or any decisions you made
