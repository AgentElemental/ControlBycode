import vm from "node:vm";
import { performance } from "node:perf_hooks";

// Simple, JS-only sandbox with operation step limit and timeout
// Not production grade. For multi-language support, integrate Docker runners.

const RESTRICTED = [
  "require",
  "process",
  "global",
  "globalThis",
  "eval",
  "Function",
  "WebAssembly",
  "SharedArrayBuffer",
  "Atomics",
  "Worker",
];

export async function runPlayerCode(source, world, playerId) {
  const start = performance.now();
  const logs = [];
  const actions = [];
  let error = null;
  let opCount = 0;
  const OP_LIMIT = 5000;
  const TIME_LIMIT_MS = 150; // per tick

  // Tiny API the player can use
  const api = {
    moveForward: () => actions.push({ type: "move", dir: "forward" }),
    turnLeft: () => actions.push({ type: "turn", dir: "left" }),
    turnRight: () => actions.push({ type: "turn", dir: "right" }),
    sense: () => ({
      /* could expose nearby tiles */
    }),
    log: (...a) => logs.push(a.map(String).join(" ")),
  };

  // Instrumentation to count basic ops using Proxy wrappers for api methods
  for (const k of Object.keys(api)) {
    const fn = api[k];
    api[k] = new Proxy(fn, {
      apply(target, thisArg, args) {
        opCount++;
        if (opCount > OP_LIMIT) throw new Error("Operation limit exceeded");
        return Reflect.apply(target, thisArg, args);
      },
    });
  }

  // Prepare context
  const context = vm.createContext(Object.create(null));
  const safeConsole = { log: (...a) => logs.push(a.map(String).join(" ")) };
  Object.defineProperties(
    context,
    Object.getOwnPropertyDescriptors({ api, console: safeConsole })
  );

  // Static checks: block obvious restricted identifiers
  for (const bad of RESTRICTED) {
    if (source.includes(bad)) {
      error = `Use of restricted identifier: ${bad}`;
      return finish();
    }
  }

  const wrapped = `"use strict"; (async () => { ${source}\n; })()`;

  try {
    const script = new vm.Script(wrapped, { timeout: TIME_LIMIT_MS });
    const p = script.runInContext(context, { timeout: TIME_LIMIT_MS });
    await Promise.race([
      Promise.resolve(p),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("Timeout exceeded")), TIME_LIMIT_MS)
      ),
    ]);
  } catch (e) {
    error = String((e && e.message) || e);
  }

  return finish();

  function finish() {
    const end = performance.now();
    const metrics = {
      timeMs: +(end - start).toFixed(2),
      ops: opCount,
      size: Buffer.byteLength(source, "utf8"),
    };
    return { actions, logs, error, metrics };
  }
}
