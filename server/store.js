import { promises as fs } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const FILE = join(DATA_DIR, "leaderboard.json");

export async function addScore(name, delta) {
  const data = await readAll();
  data[name] = (data[name] || 0) + delta;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

export async function readAll() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
