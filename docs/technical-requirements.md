# Technical Requirements and Constraints

This document turns the prompt in `App.prompt.md` into a concrete, buildable spec. The initial implementation is an HTML/CSS/JS + Node.js prototype with a JS-only sandbox, and extension hooks for additional languages via Docker.

## Architecture Overview
- Client: HTML5, CSS, vanilla JS. Renders grid world and UI, sends player code to server.
- Server: Node.js (Express + Socket.IO). Manages rooms, world state, scoring, and executes player code in isolated sandboxes.
- Sandbox: JavaScript-only proof-of-concept using Node VM with strict restrictions, per-tick execution limits, and metrics collection. Extensible to other languages via containerized runners.
- Storage: In-memory for prototype. Interface extracted to allow swapping with Redis/Postgres for persistence and scale.

## Game Mechanics
- Grid world per room: width=10, height=10, random obstacles and goal positions.
- Player entity: position (x,y), direction (N,E,S,W).
- Actions per tick: moveForward, turnLeft, turnRight. One action applied per run-step to bound pace.
- Time limit: 2-minute rounds per room; server countdown resets world and persists scores to in-memory history.
- Concurrency: Up to 8 players per room (configurable). Rooms are isolated instances.

## Code Execution Engine
- Language support (initial): JavaScript only, executed server-side via Node VM in a locked-down context.
- Restricted globals: require, process, global, globalThis, eval, Function, WebAssembly, SharedArrayBuffer, Atomics, Worker.
- Execution envelope: per-run time limit 150ms and operation count limit 5,000 (instrumented via API call proxies). Source length capped (20KB).
- IO: Only exposed API methods and a safe console.log -> server logs buffer. No network/disk.
- Error reporting: Captures thrown errors and restricted identifier usage; returned to client.
- Metrics collected: wall time (ms), API op count, code size (bytes). Memory metrics approximated by source size and could be extended via process.resourceUsage in isolated child processes.
- Isolation: Each run gets a fresh VM context bound to a room-scoped world snapshot; player effects are applied via validated actions only.
- Multi-language stubs: Define a Runner interface with run(code, input, limits) -> {actions, logs, error, metrics}. Provide Docker images with language tooling, run code with ulimits, seccomp, cgroups, timeouts; parse standardized JSON from stdout.

## Multiplayer Components
- Authentication: Anonymous by default with display name; pluggable auth provider (OAuth) later.
- Sessions: Socket connection bound to a room and transient player profile.
- Matchmaking: Quick-join finds a room with <8 players or creates new.
- Sync: Server emits state deltas at events (joins, runs, timer ticks); clients render deterministic views.
- Protocol: Socket.IO events: state, roundReset, setName, updateCode, runOnce, autoRun.

## Scoring System
- Positive:
  - Success action: +1
  - Goal reached: +20
  - Efficiency by API op count: up to +5
  - Execution time: <20ms +3; <60ms +1
  - Code size: <200B +2; <800B +1
- Negative:
  - Error during execution: -5
  - Blocked move: no bonus (could add -1)
  - Timeout or op-limit breach: treated as error
- Bonus points for optimal solutions: define per-challenge thresholds (fewest steps to collect all goals) and award +10 if within threshold.

## Leaderboard System
- Per-match scoreboard maintained in-room and updated on every state change.
- Global leaderboard (prototype): in-memory aggregation by player name. API surface extracted for DB later.
- History: persist per-round results with timestamp, player, score delta, achievements into JSON file (optional in prototype to avoid FS writes in limited environments).
- Achievements: simple computed flags (first goal, fastest completion, least ops in round).

## Challenge Framework
- Difficulty: start with easy (few obstacles) to hard (dense obstacles, multiple goals). Seed RNG per room for reproducibility.
- Randomization: obstacle/goal placement varied per round with constraints to ensure solvability (path exists).
- Progressive complexity: later rounds increase world size, add new actions (pick/drop), and hazards.
- Time-based rounds: authoritative server timer; clients render remaining seconds.

## Security & Constraints
- Never execute untrusted code on the server without isolation. The VM approach here is for prototype only. For production, use containers or firecracker micro-VMs with strict resource controls.
- Enforce limits: wall-clock timeout, CPU time (via OS), memory (container limit), file system/network disabled.
- Validate and sanitize any serialized messages to/from runner processes.
- Rate limit run requests per player and per room to prevent flooding.

## Performance & Scale
- Horizontal scale with sticky sockets per room. Use Redis for pub/sub to fan out room events across instances.
- Use monotonic timers; avoid long event-loop stalls. Offload code execution to worker threads or child processes when adding heavy languages.
- Rendering: canvas-based; keep state small and diff if needed.

## Extensibility
- Runner interface with pluggable implementations per language.
- World rules modular: actions registry and validators.
- Storage abstraction: swap in Redis/Postgres without changing game loop.

## Acceptance Criteria (Prototype)
- Multiple clients can join and see each other in the same room.
- Editing/running code applies one action step and updates scores in real-time.
- Round timer resets world and persists scores in memory.
- Sandbox enforces time/op/identifier restrictions and reports errors and metrics.
- Frontend is pure HTML/CSS/JS and works in modern browsers.
