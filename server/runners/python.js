import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

// Simple Python runner (no Docker). For real isolation, run inside Docker with ulimits.
// Expects user code to print a single action token to stdout: MOVE, LEFT, RIGHT

export async function runPython(code, input) {
  const start = performance.now();
  let logs = [];
  const file = join(
    tmpdir(),
    `player_${Date.now()}_${Math.random().toString(36).slice(2)}.py`
  );
  const wrapper = `# sandbox wrapper\nimport sys\n\n# Input is not provided here beyond a stub; expand as needed.\n# Print exactly one of: MOVE, LEFT, RIGHT\n${code}\n`;
  await fs.writeFile(file, wrapper, "utf8");

  const TIME_LIMIT_MS = 300;
  let stdout = "",
    stderr = "";
  let error = null;

  try {
    const proc = spawn("python", [file], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, TIME_LIMIT_MS);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    const exit = await new Promise((res) => proc.on("close", res));
    clearTimeout(t);
    if (exit !== 0 && !stdout.trim())
      error = stderr.trim() || `Exit code ${exit}`;
  } catch (e) {
    error = String((e && e.message) || e);
  }

  const token = stdout.trim().split(/\s+/)[0] || "";
  const actions = toAction(token);
  if (stderr.trim()) logs.push(stderr.trim());

  const metrics = {
    timeMs: +(performance.now() - start).toFixed(2),
    size: Buffer.byteLength(code),
  };
  return { actions, logs, error, metrics };
}

function toAction(tok) {
  const t = tok.toUpperCase();
  if (t === "MOVE") return [{ type: "move", dir: "forward" }];
  if (t === "LEFT") return [{ type: "turn", dir: "left" }];
  if (t === "RIGHT") return [{ type: "turn", dir: "right" }];
  return [];
}
