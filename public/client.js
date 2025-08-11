/* global io */
const socket = io();
let state = { players: [], roundEndsAt: 0, running: false };
let ownWorld = null;
let selfId = null;

const nameInput = document.getElementById("name");
const saveNameBtn = document.getElementById("saveName");
const editor = document.getElementById("editor");
const runOnceBtn = document.getElementById("runOnce");
const autoRunChk = document.getElementById("autoRun");
const logsDiv = document.getElementById("logs");
const scoreboardDiv = document.getElementById("scoreboard");
const timerSpan = document.getElementById("timer");
const languageSel = document.getElementById("language");
const grid = document.getElementById("grid");
const ctx = grid.getContext("2d");
const notice = document.getElementById("notice");
// No sample insertion button
const dirWatcher = document.getElementById("dirWatcher");
const adminEmail = document.getElementById("adminEmail");
const adminPass = document.getElementById("adminPass");
const adminLoginBtn = document.getElementById("adminLogin");
const adminStartBtn = document.getElementById("adminStart");
const adminEndBtn = document.getElementById("adminEnd");
const adminClearBtn = document.getElementById("adminClear");

saveNameBtn.onclick = () => socket.emit("setName", nameInput.value);
runOnceBtn.onclick = () => socket.emit("runOnce");
autoRunChk.onchange = () => socket.emit("autoRun", autoRunChk.checked);
editor.oninput = () => socket.emit("updateCode", editor.value);
// No sample insertion available
languageSel &&
  (languageSel.onchange = () => {
    socket.emit("setLanguage", languageSel.value);
    // Do not auto-insert template code on language change
  });

socket.on("state", (s) => {
  state = s;
  render();
  const me = s.players.find((p) => p.name === nameInput.value);
  if (me?.nameLocked) {
    nameInput.disabled = true;
    saveNameBtn.disabled = true;
  }
});

socket.on("roundReset", () => {
  addLog("--- New Round ---");
});
socket.on("roundEnded", () => {
  addLog("--- Round Ended ---");
});
socket.on("world", (w) => {
  ownWorld = w;
  render();
});
socket.on("nameRejected", (p) => {
  showNotice(p?.reason || "Name rejected");
});
socket.on("needName", () => {
  showNotice("Set your player name first. It cannot be changed later.");
});
socket.on("self", (me) => {
  selfId = me?.id || null;
});

socket.on("global", (g) => {
  // Append global leaderboard to scoreboard footer
  if (!g?.leaderboard) return;
  // ensure separator appears after current scoreboard list
  const sep = document.createElement("div");
  sep.className = "row";
  sep.innerHTML = "<em>Global Top</em>";
  scoreboardDiv.appendChild(sep);
  for (const e of g.leaderboard) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${e.name}</span><span>${e.score} pts</span>`;
    scoreboardDiv.appendChild(row);
  }
});

function addLog(line) {
  const p = document.createElement("div");
  p.textContent = line;
  logsDiv.prepend(p);
}

function render() {
  renderTimer();
  renderScoreboard();
  renderWorld();
  renderLogs();
}

function renderTimer() {
  if (!state.running) {
    timerSpan.textContent = "Waiting to start";
    return;
  }
  const remains = Math.max(0, state.roundEndsAt - Date.now());
  const s = Math.ceil(remains / 1000);
  timerSpan.textContent = `Round ends in ${s}s`;
}

function renderScoreboard() {
  scoreboardDiv.innerHTML = "";
  for (const p of state.players.sort((a, b) => b.score - a.score)) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${p.name}</span><span>${p.score} pts</span>`;
    scoreboardDiv.appendChild(row);
  }
}

function renderWorld() {
  const w = ownWorld?.width || 10,
    h = ownWorld?.height || 10;
  const cell = Math.floor(Math.min(grid.width / w, grid.height / h));
  ctx.fillStyle = "#0b0e1a";
  ctx.fillRect(0, 0, grid.width, grid.height);
  // grid
  ctx.strokeStyle = "#2a2f54";
  for (let x = 0; x <= w; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, h * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(w * cell, y * cell);
    ctx.stroke();
  }
  // obstacles
  ctx.fillStyle = "#5c677d";
  for (const k of ownWorld?.obstacles || []) {
    const [x, y] = k.split(",").map(Number);
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  // goals
  ctx.fillStyle = "#2ecc71";
  for (const k of ownWorld?.goals || []) {
    const [x, y] = k.split(",").map(Number);
    ctx.beginPath();
    ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // draw only self player in own world
  if (selfId) {
    const me = state.players.find((p) => p.id === selfId);
    const pos = (ownWorld?.players || {})[selfId] || { x: 1, y: 1, dir: "E" };
    drawMarker(pos.x, pos.y, me?.name || "?", cell);
    // Draw a direction arrow to show current facing
    drawDirectionArrow(pos.x, pos.y, pos.dir, cell);
    ctx.fillStyle = "#c6d0f5";
    ctx.font = `${Math.floor(cell * 0.2)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(me?.name || "?", (pos.x + 0.5) * cell, (pos.y - 0.1) * cell);
  }
  // direction watcher for self
  const myPos = selfId ? (ownWorld?.players || {})[selfId] : null;
  dirWatcher.textContent = myPos ? `Dir: ${myPos.dir}` : "";
}

// Removed insertSample functionality

function showNotice(msg) {
  notice.textContent = msg;
  notice.style.display = "block";
  setTimeout(() => {
    notice.textContent = "";
    notice.style.display = "none";
  }, 3000);
}

function renderLogs() {
  const me =
    state.players.find((p) => p.name === nameInput.value) || state.players[0];
  logsDiv.innerHTML = "";
  if (me?.lastError) {
    addLog("Error: " + me.lastError);
  }
  for (const line of me?.lastLogs || []) addLog(line);
}

function drawMarker(x, y, name, cell) {
  const cx = (x + 0.5) * cell,
    cy = (y + 0.5) * cell;
  ctx.fillStyle = "#f39c12";
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b0e1a";
  const initials = (name || "?").slice(0, 2).toUpperCase();
  ctx.font = `${Math.floor(cell * 0.25)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, cx, cy);
}

function drawDirectionArrow(x, y, dir, cell) {
  const cx = (x + 0.5) * cell;
  const cy = (y + 0.5) * cell;
  const len = cell * 0.45;
  let dx = 1,
    dy = 0;
  if (dir === "N") {
    dx = 0;
    dy = -1;
  } else if (dir === "S") {
    dx = 0;
    dy = 1;
  } else if (dir === "W") {
    dx = -1;
    dy = 0;
  } else {
    dx = 1;
    dy = 0;
  }
  const ex = cx + dx * len;
  const ey = cy + dy * len;
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = Math.max(2, Math.floor(cell * 0.06));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  // Arrow head
  const ah = cell * 0.14;
  const leftX = ex + -dy * ah;
  const leftY = ey + dx * ah;
  const rightX = ex - -dy * ah;
  const rightY = ey - dx * ah;
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
}

setInterval(renderTimer, 200);
adminLoginBtn &&
  (adminLoginBtn.onclick = () =>
    socket.emit("adminLogin", {
      email: adminEmail.value,
      password: adminPass.value,
    }));
adminStartBtn && (adminStartBtn.onclick = () => socket.emit("adminStartRound"));
adminEndBtn && (adminEndBtn.onclick = () => socket.emit("adminEndRound"));
adminClearBtn &&
  (adminClearBtn.onclick = () => socket.emit("adminClearGlobal"));
socket.on("adminOk", (p) => {
  showNotice(p.ok ? "Admin login ok" : p.reason || "Admin login failed");
});

function setStarterCode(lang) {
  if (!editor.value.trim()) {
    if (lang === "js")
      editor.value = `// Emit exactly one action per step\napi.moveForward();\n// or api.turnLeft(); or api.turnRight();`;
    if (lang === "python")
      editor.value = `# Print one token: MOVE | LEFT | RIGHT\nprint('MOVE')`;
    if (lang === "c")
      editor.value = `// Print one token: MOVE | LEFT | RIGHT\n#include <stdio.h>\nint main(){ printf("MOVE\n"); return 0; }`;
  }
}
