import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { runPlayerCode as runJS } from "./sandbox.js";
import { runCode as runExternal } from "./runners/index.js";
import { addScore, readAll as readLeaderboard } from "./store.js";
import { createInitialWorld, applyAction, scoreSubmission } from "./logic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));

const rooms = new Map();

function createRoom() {
  const id = uuidv4().slice(0, 8);
  const room = {
    id,
    players: new Map(), // socketId -> {name, score, code, metrics, ...}
    worlds: new Map(), // socketId -> world (separate level per player)
    roundEndsAt: 0,
    running: false,
    admins: new Set(),
  };
  rooms.set(id, room);
  return room;
}

function getOrCreateJoinableRoom() {
  for (const room of rooms.values()) {
    if (room.players.size < 8) return room;
  }
  return createRoom();
}

io.on("connection", (socket) => {
  // quick matchmaking
  const room = getOrCreateJoinableRoom();
  socket.join(room.id);

  const player = {
    name: null,
    nameLocked: false,
    score: 0,
    code: "",
    metrics: {},
    language: "js",
  };
  room.players.set(socket.id, player);

  io.to(room.id).emit("state", serializeRoom(room));
  io.to(socket.id).emit("self", { id: socket.id });
  // send the player's world (may be null until round starts)
  io.to(socket.id).emit("world", room.worlds.get(socket.id) || null);
  // If round already running, create a world for this player immediately (admins excluded)
  if (room.running) {
    const p = room.players.get(socket.id);
    if (p && !p.isAdmin && !room.worlds.has(socket.id)) {
      room.worlds.set(socket.id, createInitialWorld());
      io.to(socket.id).emit("world", room.worlds.get(socket.id));
    }
  }

  socket.on("setName", (name) => {
    if (player.nameLocked) return;
    const raw = String(name || "").trim();
    const cleaned = raw.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 24);
    if (cleaned.length < 3) {
      io.to(socket.id).emit("nameRejected", {
        reason: "Name must be 3+ characters.",
      });
      return;
    }
    // Duplicate check in room
    const duplicate = Array.from(room.players.values()).some(
      (p) => p.name && p.name.toLowerCase() === cleaned.toLowerCase()
    );
    if (duplicate) {
      io.to(socket.id).emit("nameRejected", {
        reason: "Name already taken in this room.",
      });
      return;
    }
    player.name = cleaned;
    player.nameLocked = true;
    io.to(room.id).emit("state", serializeRoom(room));
  });

  socket.on("updateCode", (code) => {
    if (player.isAdmin) {
      io.to(socket.id).emit("needName");
      return;
    }
    if (!player.nameLocked) {
      io.to(socket.id).emit("needName");
      return;
    }
    player.code = String(code || "").slice(0, 20000);
  });

  socket.on("setLanguage", (lang) => {
    if (player.isAdmin) return;
    const allowed = ["js", "python", "c"];
    if (allowed.includes(lang)) player.language = lang;
    io.to(room.id).emit("state", serializeRoom(room));
  });

  // Admin login (very simple, room-scoped)
  socket.on("adminLogin", ({ email, password }) => {
    if (email === "admin@gmail.com" && password === "admin") {
      room.admins.add(socket.id);
      // mark this connection as admin and prevent gameplay
      const me = room.players.get(socket.id);
      if (me) {
        me.isAdmin = true;
        me.auto = false;
      }
      io.to(socket.id).emit("adminOk", { ok: true });
    } else {
      io.to(socket.id).emit("adminOk", {
        ok: false,
        reason: "Invalid credentials",
      });
    }
  });

  socket.on("adminStartRound", () => {
    if (!room.admins.has(socket.id)) return;
    startRound(room);
  });

  socket.on("adminEndRound", () => {
    if (!room.admins.has(socket.id)) return;
    endRound(room);
  });

  socket.on("runOnce", async () => {
    if (player.isAdmin) return;
    if (!player.nameLocked) {
      io.to(socket.id).emit("needName");
      return;
    }
    await runForPlayer(room, socket.id, { auto: false });
  });

  socket.on("autoRun", async (enable) => {
    if (player.isAdmin) return;
    if (!player.nameLocked) {
      io.to(socket.id).emit("needName");
      return;
    }
    player.auto = !!enable;
  });

  socket.on("disconnect", () => {
    if (room.admins.has(socket.id)) room.admins.delete(socket.id);
    room.players.delete(socket.id);
    if (room.players.size === 0) {
      rooms.delete(room.id);
    } else {
      io.to(room.id).emit("state", serializeRoom(room));
    }
  });
});

async function runForPlayer(room, socketId, { auto }) {
  const player = room.players.get(socketId);
  if (!player) return;
  const code = player.code || "";

  // If not running, start on first run when no admin logged in
  if (!room.running && room.admins.size === 0) {
    startRound(room);
  }

  // Must have an active round and a world
  if (!room.running) return;
  if (!room.worlds.has(socketId)) {
    room.worlds.set(socketId, createInitialWorld());
  }
  const world = room.worlds.get(socketId);

  let exec;
  if (player.language === "js") {
    exec = await runJS(code, world, socketId);
  } else {
    exec = await runExternal({
      language: player.language,
      code,
      input: { world, playerId: socketId },
    });
  }
  // exec: { actions: [...], logs: [], error, metrics }
  const result = applyAction(world, socketId, exec.actions?.[0]); // one step per run
  const scoreDelta = scoreSubmission({ exec, result });
  player.score += scoreDelta;
  player.metrics = exec.metrics;
  player.lastLogs = exec.logs?.slice(-5) || [];
  player.lastError = exec.error || null;
  io.to(socketId).emit("world", world);
  io.to(room.id).emit("state", serializeRoom(room));
}

// round loop
setInterval(() => {
  const now = Date.now();
  (async () => {
    for (const room of rooms.values()) {
      if (room.running && now >= room.roundEndsAt) {
        await endRound(room);
      }

      // autoruns with simple backpressure
      for (const [sid, p] of room.players) {
        if (p.auto && !p._busy && room.running) {
          p._busy = true;
          runForPlayer(room, sid, { auto: true }).finally(() => {
            p._busy = false;
          });
        }
      }
    }
  })();
}, 300);

function serializeRoom(room) {
  const payload = {
    id: room.id,
    players: Array.from(room.players.entries())
      .filter(([_, p]) => !p.isAdmin)
      .map(([id, p]) => ({
        id,
        name: p.name,
        nameLocked: !!p.nameLocked,
        score: p.score,
        metrics: p.metrics,
        lastLogs: p.lastLogs,
        lastError: p.lastError,
      })),
    roundEndsAt: room.roundEndsAt,
    running: room.running,
    global: { leaderboard: [] },
  };
  // Best-effort include global leaderboard (non-blocking)
  readLeaderboard()
    .then((lb) => {
      const top = Object.entries(lb)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, score]) => ({ name, score }));
      io.to(room.id).emit("global", { leaderboard: top });
    })
    .catch(() => {});
  return payload;
}

function startRound(room) {
  const now = Date.now();
  room.running = true;
  room.roundEndsAt = now + 120000;
  room.worlds = new Map();
  for (const [sid, p] of room.players.entries()) {
    if (p.isAdmin) continue; // admins do not play
    const world = createInitialWorld();
    // random start not on obstacle or goal
    let sx = 1,
      sy = 1,
      tries = 0;
    while (tries++ < 200) {
      sx = Math.floor(Math.random() * world.width);
      sy = Math.floor(Math.random() * world.height);
      const k = `${sx},${sy}`;
      if (!world.obstacles.includes(k) && !world.goals.includes(k)) break;
    }
    world.players[sid] = { x: sx, y: sy, dir: "E" };
    room.worlds.set(sid, world);
  }
  for (const p of room.players.values()) {
    p.metrics = {};
    p._busy = false;
  }
  io.to(room.id).emit("roundReset");
  // send each player their world
  for (const [sid, p] of room.players.entries()) {
    if (p.isAdmin) continue;
    io.to(sid).emit("world", room.worlds.get(sid));
  }
  // broadcast updated state (running and timer)
  io.to(room.id).emit("state", serializeRoom(room));
}

async function endRound(room) {
  const now = Date.now();
  if (!room.running) return;
  room.running = false;
  room.roundEndsAt = now; // ended
  for (const p of room.players.values()) {
    if (p.name) await addScore(p.name, p.score);
  }
  // Reset per-match scores (keep names)
  for (const p of room.players.values()) p.score = 0;
  io.to(room.id).emit("roundEnded");
  // broadcast updated state (stopped)
  io.to(room.id).emit("state", serializeRoom(room));
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
