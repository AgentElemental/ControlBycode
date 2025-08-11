# Real-time Multiplayer Programming Game (Prototype)

This is a Node.js + Socket.IO prototype of a real-time multiplayer programming game inspired by Reeborg's World. Players write code to control their robot on a grid to collect goals within timed rounds.

- Frontend: HTML/CSS/JS (no framework)
- Backend: Node.js, Express, Socket.IO
- Sandbox: JavaScript-only safe executor prototype with time/memory/op limits. Hooks/stubs to extend for Python/Java/C++/C via Docker.

## Quick start (Windows PowerShell)

```powershell
# 1) Install Node 18+ then:
cd "d:\Control by Code"
npm install
npm run dev
# Open http://localhost:3000 in your browser
```

## Features in this prototype
- Rooms/matchmaking (quick-join into a room)
- Grid world with obstacles and goals
- Player code editor and Run/Auto-run
- Server-side sandbox execution with operation/time limit
- Real-time state sync and scoreboard per match
- Round timer and scoring (efficiency, time, memory, success, penalties)

## Next steps
- Add Docker-based multi-language sandboxes (Python/Java/C++/C)
- Persistent DB for global leaderboards and history
- More challenge types and achievements

See `docs/technical-requirements.md` for the full spec and constraints.
