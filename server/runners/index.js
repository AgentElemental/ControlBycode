import { runPython } from "./python.js";
import { runC } from "./c.js";

// Generic runner interface
// runCode({ language, code, input }) -> { actions, logs, error, metrics }
export async function runCode({ language, code, input }) {
  if (language === "python") return runPython(code, input);
  if (language === "c") return runC(code, input);
  return { actions: [], logs: [], error: "Unsupported language", metrics: {} };
}
