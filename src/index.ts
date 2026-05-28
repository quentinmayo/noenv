#!/usr/bin/env node
/**
 * NoEnv CLI entry point.
 *
 * node:sqlite is stable enough for our use but still emits an ExperimentalWarning
 * on load. Silence just that one warning so normal runs have clean stderr. This
 * must run before any dynamic import of a module that pulls in node:sqlite.
 */
const originalEmit = process.emit.bind(process);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).emit = (name: string, data: unknown, ...rest: unknown[]): boolean => {
  if (
    name === "warning" &&
    data instanceof Error &&
    data.name === "ExperimentalWarning" &&
    /SQLite/i.test(data.message)
  ) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (originalEmit as any)(name, data, ...rest);
};

import { parseArgv } from "./cli/parse.js";
import { route } from "./cli/router.js";
import { log } from "./cli/output.js";

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));
  process.exitCode = await route(parsed);
}

main().catch((err: unknown) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
