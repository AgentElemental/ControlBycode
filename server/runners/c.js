import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

// Simple C runner (no Docker). Requires gcc on PATH. For safety use Docker.
// Expects program to print one token: MOVE | LEFT | RIGHT

export async function runC(code, input) {
  const start = performance.now();
  const base = join(
    tmpdir(),
    `player_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
  const cFile = `${base}.c`;
  const exe = `${base}.exe`;
  // Accept three patterns:
  // 1) Full program (contains main): compile as-is
  // 2) Plain token line: MOVE|LEFT|RIGHT -> generate minimal program
  // 3) Snippet of statements: wrap inside a minimal main
  const hasMain = /\b(int|void)\s+main\s*\(/.test(code);
  const token = (code || "").trim().toUpperCase();
  const isTokenOnly = /^(MOVE|LEFT|RIGHT)$/.test(token);
  let wrapper;
  if (hasMain) {
    wrapper = code;
  } else if (isTokenOnly) {
    const word = token;
    wrapper = `#include <stdio.h>\nint main(){ printf("${word}\\n"); return 0; }\n`;
  } else {
    wrapper = `#include <stdio.h>\nint main(){\n${code}\nreturn 0;}\n`;
  }
  await fs.writeFile(cFile, wrapper, "utf8");

  let error = null,
    logs = [];
  const COMPILE_TIMEOUT_MS = 5000;
  const RUN_TIMEOUT_MS = 500;
  try {
    await execWithTimeout(
      "gcc",
      [cFile, "-O2", "-s", "-o", exe],
      COMPILE_TIMEOUT_MS
    );
    const { stdout, stderr } = await execWithTimeout(exe, [], RUN_TIMEOUT_MS);
    if (stderr) logs.push(stderr);
    const token = (stdout || "").trim().split(/\s+/)[0] || "";
    const actions = toAction(token);
    const metrics = {
      timeMs: +(performance.now() - start).toFixed(2),
      size: Buffer.byteLength(code),
    };
    return { actions, logs, error, metrics };
  } catch (e) {
    error = String((e && e.message) || e);
    return {
      actions: [],
      logs,
      error,
      metrics: {
        timeMs: +(performance.now() - start).toFixed(2),
        size: Buffer.byteLength(code),
      },
    };
  }
}

function toAction(tok) {
  const t = tok.toUpperCase();
  if (t === "MOVE") return [{ type: "move", dir: "forward" }];
  if (t === "LEFT") return [{ type: "turn", dir: "left" }];
  if (t === "RIGHT") return [{ type: "turn", dir: "right" }];
  return [];
}

function execWithTimeout(cmd, args, ms) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "",
      stderr = "";
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      reject(new Error("Timeout exceeded"));
    }, ms);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      clearTimeout(t);
      if (code === 0 || cmd.endsWith(".exe")) resolve({ stdout, stderr, code });
      else reject(new Error("Exit " + code + " " + stderr));
    });
  });
}
