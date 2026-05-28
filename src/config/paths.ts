import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/** Per-user NoEnv home. Override with NOENV_HOME (useful for tests/CI). */
export const NOENV_HOME = process.env.NOENV_HOME
  ? path.resolve(process.env.NOENV_HOME)
  : path.join(os.homedir(), ".noenv");

export const GLOBAL_CONFIG_PATH = path.join(NOENV_HOME, "config.json");
export const DEFAULT_DB_PATH = path.join(NOENV_HOME, "noenv.db");
export const PROJECT_CONFIG_NAME = "noenv.config.json";
export const SCHEMA_NAME = "noenv.schema.json";

export function ensureNoenvHome(): void {
  fs.mkdirSync(NOENV_HOME, { recursive: true });
}

/** Walk up from `startDir` looking for a committed project config. */
export function findProjectConfig(startDir = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, PROJECT_CONFIG_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
