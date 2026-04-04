# Architectural Analysis: claudetree → t3code Migration

---

## 1. claudetree — Current Architecture and What's Broken

### What It Does

claudetree is a local web app that manages multiple Claude Code sessions, each isolated in a git worktree. Architecture is a classic split:

- **Backend**: Express + Node.js. REST API for projects/worktrees/diff/commit. `node-pty` for terminal sessions. `ws` for WebSocket relay. `simple-git` for git ops. State: two in-memory Maps (`sessions` in `pty.ts`, `worktreeRegistry` in `worktrees.ts`).
- **Frontend**: Vite + React. Single `useWorktrees` hook managing all project/worktree state. `App.tsx` is the root composer. xterm.js terminal connected directly to the WebSocket.

### Structural Problems

#### 1. Ephemeral In-Memory State With No Recovery

`worktreeRegistry` in `routes/worktrees.ts` is a plain `Map<string, Worktree>`. `sessions` in `terminal/pty.ts` is a plain `Map<string, PtySession>`. Both die on backend restart. On reconnect, the frontend gets new UUIDs from the GET endpoint (re-parsed from `git worktree list`), while any open WebSocket terminals reference dead session IDs. Result: phantom sessions, stale references, broken terminals.

The `getWorktree()` function exported from `worktrees.ts` and called from `pty.ts` is a synchronous registry lookup — it only works if the worktree was created or fetched during this process lifetime.

#### 2. No State Machine for Terminal/Session Lifecycle

`handleConnection` in `pty.ts` has a single fork: session exists → attach client; session missing → spawn pty + launch claude with `setTimeout(() => term.write('claude\r'), 500)`. That's it. No states: `spawning`, `ready`, `crashed`, `reconnecting`. If the pty exits abnormally (claude crashes, OOM), `term.onExit` deletes the session and closes all clients — no reconnect logic, no error surface to the frontend, just a silent close.

The `setTimeout(..., 500)` before writing `claude\r` is a hardcoded timing assumption. It will fail on slow machines or when the shell has init scripts. It is not event-driven; it's a guess.

#### 3. No Ordered Event Delivery

The WebSocket in `pty.ts` does raw broadcast: for each client in `session.clients`, call `client.send(data)`. There is no sequence number, no envelope, no message ordering guarantee. If a client reconnects mid-output, it gets the live stream from the reconnection point — no replay, no hydration of prior terminal state. The UI will render an incomplete picture of what happened.

On the frontend, `useWorktrees` uses `useCallback` + `useEffect` to load projects and worktrees via REST. The `loadWorktrees` callback depends on `selectedProject`, which means a project selection change triggers a re-fetch. There is no push-based update — if another client creates a worktree, nothing propagates. The UI is a polling snapshot, not a live view.

#### 4. Race Conditions in Worktree Creation

`POST /api/worktrees/:projectId` in `worktrees.ts` runs: `git worktree add` → copy config files → assign UUID → register in Map → return. No locking. Two concurrent POST requests for the same feature name will both run `git worktree add` — one will succeed and one will fail with a git error that propagates as a 500. The registry will not be in a consistent state because the failed path doesn't clean up.

After creation, the frontend does `setWorktrees((prev) => [...prev, wt])` and `setSelectedWorktree(wt)` — optimistic local update, no server push. If the server-side Map already has a conflicting ID (restart scenario), the frontend state diverges from backend state immediately.

#### 5. No Typed Protocol — Raw WebSocket Multiplexing

The WebSocket at `/terminal/:worktreeId` is a raw byte stream with a single parsing exception: if the client sends JSON with `{ type: 'resize', cols, rows }`, it gets handled as a resize. Everything else is raw terminal input. There is no capability to multiplex other message types (status, error, session-state) over the same socket without breaking the terminal stream. Extending the protocol requires invasive changes.

#### 6. Frontend Hook Architecture — No Lifecycle Separation

`useWorktrees` owns projects, selected project, worktrees, selected worktree, and loading state all in one hook. There is no separation between data-fetching state, UI selection state, and mutation state. This makes it impossible to invalidate worktree state without re-fetching projects, and vice versa. No error state is surfaced — errors go to `console.error` and are silently ignored. The UI has no way to show fetch failures.

---

## 2. t3code — Architecture and Why It Works

### Core Design Philosophy

t3code is built around three principles: **ordered delivery via a single push path**, **queue-backed workers for async isolation**, and **Zod/Effect schema contracts at every boundary**. These aren't incidental — they're the explicit antidotes to the class of bugs claudetree has.

### Key Components

#### WsTransport (State Machine)
`apps/web/src/wsTransport.ts` manages connection states: `connecting → open → reconnecting → closed → disposed`. Outbound requests are **queued while disconnected and flushed on reconnect**. This alone eliminates the "user clicks a button while reconnecting and the request is silently dropped" failure mode. Push events are cached per-channel; new subscribers get the last cached push via `replayLatest`. This is how the UI hydrates on reconnect without a full refresh.

#### ServerPushBus (Ordered Push)
All server-to-client pushes flow through a single `ServerPushBus`. Each push envelope has a monotonic `sequence` field per connection. The client can detect gaps and request replay via `orchestration.replayEvents(fromSequenceExclusive)`. This is the structural solution to "client reconnects and misses events" — sequence numbers turn an unreliable stream into a recoverable one.

#### DrainableWorker (Ordered Async Work)
`packages/shared/src/DrainableWorker.ts` is a `TxQueue.unbounded` + `Effect.forever` loop with an `outstanding` counter (a `TxRef<number>`). The `drain()` effect retries via STM until outstanding reaches 0. This serves two purposes: (1) async work is serialized through the queue, eliminating race conditions where two concurrent events both try to mutate the same orchestration state; (2) tests call `drain()` instead of `setTimeout` to get deterministic synchronization.

The three workers — `ProviderRuntimeIngestion`, `ProviderCommandReactor`, `CheckpointReactor` — each use `DrainableWorker` internally. This means the full pipeline from "provider emits event" to "push goes to client" is a sequence of drainable queues. No unbounded parallelism, no timing races.

#### Typed Contracts (Effect Schema)
`packages/contracts/src/orchestration.ts` defines the entire domain in Effect Schema: 20+ command types, 20+ event types, read model shapes, all with Zod-equivalent runtime validation. The protocol boundary (`ws.ts`, `wsNativeApi`) decodes at the edge and fails loudly with `WsDecodeDiagnostic`. No untyped JSON blobs reach business logic. This makes it impossible to get a `cannot read property X of undefined` at runtime from a malformed server message.

#### OrchestrationEngine (Event-Sourced Read Model)
`OrchestrationEngine` persists commands as events and projects them into `OrchestrationReadModel`. State is rebuilt from the event log, not from a mutable Map. Restart = replay events. There is no lost-state-on-restart problem.

#### ServerReadiness (Startup Gate)
`wsServer/readiness.ts` holds incoming connections until startup barriers complete. Clients that connect during startup receive a `server.welcome` push only after the server is fully operational. claudetree has no equivalent — a client connecting before the backend's in-memory state is populated will get empty results and never know why.

#### ProviderService (Process Management)
The codex provider runs as a child process (JSON-RPC over stdio) managed by the server. The server owns the lifecycle — start, stop, interrupt, restart. claudetree's pty approach inverts this: the browser connection creates the process. If the browser disconnects, the process is orphaned (or killed, depending on the `onExit` handler). t3code's model means the process can outlive any single client connection.

---

## 3. Component Mapping Table

| claudetree Component | t3code Equivalent | Gap |
|---|---|---|
| `worktreeRegistry` (in-memory Map) | `OrchestrationEngine` (event-sourced, persisted) | Complete architectural mismatch — Map → event log |
| `sessions` Map in `pty.ts` | `TerminalManager` service + `ProviderService` | Process lifecycle must be server-owned, not connection-triggered |
| `setupTerminalWebSocket` | `TerminalManager` + `ws.ts` terminal channels | Needs typed envelope, sequence number, state machine |
| `handleConnection` (pty.ts) | `ProviderService.startSession` + `ProviderRuntimeIngestion` | Replace fire-and-forget with a named state machine |
| `setTimeout(..., 500)` claude launch | `ServerReadiness` barriers + `ProviderCommandReactor` | Replace timing hack with event-driven readiness |
| `worktrees.ts` REST routes | `orchestration.dispatchCommand` (WS) + `OrchestrationEngine` | REST → command dispatch; no direct mutation |
| `useWorktrees` hook | `wsNativeApi` + `WsTransport` push subscription | Pull-based REST polling → push-based event stream |
| Raw WS byte stream | `ServerPushBus` with typed envelopes + sequence | Protocol redesign required |
| No reconnect | `WsTransport` state machine + queue flush on reconnect | Build from scratch |
| No ordering | `DrainableWorker` queue chain | Build from scratch |
| No schema validation | Effect Schema contracts at transport boundary | Adopt contracts package pattern |
| `simple-git` calls inline in routes | `GitCore` + `CheckpointReactor` + `GitManager` | Extract git ops into a service layer |
| Config JSON in `~/.claudetree/` | `ServerConfig` + `ServerSettingsService` | Keep mechanism, add typed schema |

---

## 4. Build New vs Adapt vs Drop

### BUILD NEW (No salvageable analog)

**Ordered push bus with sequence numbers.** claudetree has no sequence concept. This must be designed and built — a monotonic counter per connection, a ring buffer for replay, and client-side gap detection.

**WsTransport state machine.** The frontend needs `connecting → open → reconnecting → closed → disposed` with request queuing on disconnect. Nothing in `useWorktrees` resembles this. This is a foundational piece that must be built before any UI work.

**DrainableWorker-equivalent for async flows.** The backend needs serialized async pipelines with deterministic completion signals. This is the single biggest structural gap — claudetree does everything inline in request handlers or in `term.onData` callbacks. The pattern from `DrainableWorker.ts` can be lifted directly.

**Session state machine for PTY/Claude lifecycle.** States: `idle → spawning → ready → running → crashed → recovering`. The current `if (sessions.has(id))` fork is not a state machine. This needs to be built with explicit state transitions and error surfaces.

**Event log / persistence.** `worktreeRegistry` dying on restart is a hard blocker for any serious use. Even a SQLite-backed append-only event log (simpler than t3code's full orchestration engine) solves this.

**ServerReadiness barrier.** Clients must not receive responses until the backend has fully hydrated its state from disk. This is a small build but required.

### ADAPT (Existing code is directionally correct, needs restructuring)

**Worktree git operations.** `routes/worktrees.ts` — the `simple-git` calls are fine. What needs to change: extract into a service class, add a command→event pattern so mutations go through the engine rather than directly mutating the registry, add proper error propagation.

**PTY spawn logic.** The core `pty.spawn(...)` call and `term.onData` relay in `pty.ts` are correct. What needs to change: move the spawn trigger from "first WebSocket connect" to "explicit start command", remove the `setTimeout` hack, add the state machine around it.

**Typed contracts.** claudetree has TypeScript interfaces in `types/index.ts`. These need to become Effect Schema or Zod schemas at the transport boundary. The structure of the domain objects is fine; the validation layer is missing.

**Config file management.** `loadConfig/saveConfig` and the worktree init file-copy logic are fine. They just need typed schemas and to be injected as a service rather than called directly from route handlers.

**Frontend component structure.** `App.tsx`, `Sidebar`, `FeaturesTab`, `ReviewTab` — the component decomposition is reasonable. The data layer (`useWorktrees`) needs to be replaced wholesale with a push-based transport subscription, but the components themselves can stay mostly intact.

### DROP (Actively harmful, replace entirely)

**`useWorktrees` as the data layer.** It conflates REST polling, UI selection state, and mutation state into one hook. Kill it. Replace with a transport-layer subscription model: the WsTransport emits push events, and the UI subscribes to the latest read model snapshot. Selection state moves to a separate UI-only hook.

**Direct `ws.send(data)` raw broadcast.** The `for (const client of session.clients) { client.send(data) }` pattern in `pty.ts`. This cannot be extended. Replace with a typed envelope dispatch that goes through a push bus.

**`setTimeout(..., 500)` process launch.** Not debatable. Delete it.

**In-memory-only state.** The `Map` registries as the sole source of truth. Anything that doesn't survive a process restart is a liability for a tool that users will leave running for hours.

---

## 5. Critical Risks and Unknowns

**Risk 1: claudeCode provider in t3code is a stub.**
`packages/contracts/src/orchestration.ts` has `claudeAgent` in `ProviderKind` and `ClaudeModelSelection`. t3code currently only implements codex as the provider. claudetree's whole purpose is wrapping `claude` (Claude Code CLI). If you migrate claudetree to t3code patterns, you are building the `claudeAgent` provider from scratch — there is no reference implementation. This is a significant unknown scope item.

**Risk 2: PTY vs JSON-RPC over stdio — fundamentally different IPC models.**
claudetree uses raw PTY (a terminal) as the transport for Claude Code. t3code uses JSON-RPC over stdio (structured messages). These are not compatible. If Claude Code does not support a JSON-RPC app-server mode (like codex's `codex app-server`), you cannot use t3code's `ProviderService` pattern. You would need to keep the PTY approach but wrap it in the state machine and ordering primitives — a hybrid that has risks of its own.

**Risk 3: The Effect.ts dependency is heavy and viral.**
`DrainableWorker`, `OrchestrationEngine`, and the entire server layer in t3code are built on Effect.ts (fibers, STM, layers, schemas). Adopting these patterns in claudetree means either (a) adopting Effect.ts wholesale — which changes the async model from `async/await` to Effect fibers throughout — or (b) reimplementing the same patterns in plain Node.js. Option (b) loses the composability and is error-prone. Option (a) is a steep learning curve and significant rewrite. Neither is free.

**Risk 4: Single-worktree assumption vs multi-worktree.**
t3code's architecture appears to be built around a single active session per thread. claudetree's entire premise is N concurrent Claude sessions across N worktrees, all visible and switchable simultaneously. The `OrchestrationThread` model can support multiple threads, but it's unclear if the `ProviderService` can manage N concurrent PTY sessions without contention. This needs validation before architecture commits.

**Risk 5: No test infrastructure in claudetree.**
t3code's `DrainableWorker.drain()` and `RuntimeReceiptBus` exist explicitly to make tests deterministic. claudetree has no tests. Any migration that adds the ordering/queueing infrastructure needs tests to verify it works — otherwise you're trading one class of bugs for another. Factor in test-writing time.

**Risk 6: The worktree registry UUID stability problem.**
claudetree generates new UUIDs for worktrees on each fresh GET (if not already in the Map). If you move to an event-sourced model, the worktree IDs must be stable and durable. During migration, any existing claudetree state will have ephemeral UUIDs that don't survive the transition to the new persistence layer. A migration script will be needed, and all frontend bookmarks/links referencing the old IDs will break.
