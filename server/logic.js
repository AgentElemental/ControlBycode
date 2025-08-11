// Simple grid world and scoring

export function createInitialWorld() {
  const width = 10,
    height = 10;
  const obstacles = new Set();
  // 8 random obstacle cells grouped as small vertical/horizontal blocks
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const vertical = Math.random() < 0.5;
    for (let j = 0; j < 2; j++) {
      const ox = Math.min(width - 1, x + (vertical ? 0 : j));
      const oy = Math.min(height - 1, y + (vertical ? j : 0));
      obstacles.add(key(ox, oy));
    }
  }
  const goals = new Set();
  while (goals.size < 2) {
    const gx = Math.floor(Math.random() * width);
    const gy = Math.floor(Math.random() * height);
    const k = key(gx, gy);
    if (!obstacles.has(k)) goals.add(k);
  }
  const players = {}; // id -> {x,y,dir}
  return {
    width,
    height,
    obstacles: [...obstacles],
    goals: [...goals],
    players,
  };
}

export function applyAction(world, playerId, action) {
  if (!action) return { ok: true };
  const p =
    world.players[playerId] ||
    (world.players[playerId] = { x: 1, y: 1, dir: "E" });
  if (action.type === "turn") {
    p.dir = turn(p.dir, action.dir);
    return { ok: true };
  }
  if (action.type === "move") {
    const [dx, dy] = vec(p.dir);
    const nx = p.x + dx,
      ny = p.y + dy;
    const blocked =
      nx < 0 ||
      ny < 0 ||
      nx >= world.width ||
      ny >= world.height ||
      has(world.obstacles, nx, ny);
    if (!blocked) {
      p.x = nx;
      p.y = ny;
      const hitGoal = has(world.goals, p.x, p.y);
      if (hitGoal) {
        // remove goal
        world.goals = world.goals.filter((k) => k !== key(p.x, p.y));
      }
      return { ok: true, hitGoal };
    }
    return { ok: false, reason: "blocked" };
  }
  return { ok: false, reason: "unknown-action" };
}

export function scoreSubmission({ exec, result }) {
  let score = 0;
  if (exec.error) score -= 5;
  if (result?.ok) score += 1; // successful action
  if (result?.hitGoal) score += 20; // big reward
  if (result && result.ok === false && result.reason === "blocked") score -= 2; // penalty for hitting wall

  // efficiency: fewer ops and smaller code
  score += Math.max(0, 5 - Math.floor((exec.metrics.ops || 0) / 5));
  // time: faster is better
  score += exec.metrics.timeMs < 20 ? 3 : exec.metrics.timeMs < 60 ? 1 : 0;
  // memory proxy: code size
  score += exec.metrics.size < 200 ? 2 : exec.metrics.size < 800 ? 1 : 0;

  return score;
}

function key(x, y) {
  return `${x},${y}`;
}
function has(arr, x, y) {
  return arr.includes(key(x, y));
}
export function turn(dir, t) {
  const seq = ["N", "E", "S", "W"];
  let i = seq.indexOf(dir);
  if (t === "left") i = (i + 3) % 4;
  else i = (i + 1) % 4;
  return seq[i];
}
export function vec(dir) {
  return dir === "N"
    ? [0, -1]
    : dir === "S"
    ? [0, 1]
    : dir === "W"
    ? [-1, 0]
    : [1, 0];
}
