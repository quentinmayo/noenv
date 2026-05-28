import fs from "node:fs";
import path from "node:path";
import {
  GLOBAL_CONFIG_PATH,
  DEFAULT_DB_PATH,
  ensureNoenvHome,
  findProjectConfig,
  PROJECT_CONFIG_NAME,
} from "./paths.js";
import type { GlobalConfig, NoEnvConfig } from "../types.js";

export function loadGlobalConfig(): GlobalConfig | null {
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, "utf8")) as GlobalConfig;
  } catch {
    return null;
  }
}

export function saveGlobalConfig(cfg: GlobalConfig): void {
  ensureNoenvHome();
  // 0600: readable only by the owner — this file holds the passphrase salt/verifier.
  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export function loadProjectConfig(
  startDir?: string,
): { config: NoEnvConfig; path: string } | null {
  const p = findProjectConfig(startDir);
  if (!p) return null;
  return { config: JSON.parse(fs.readFileSync(p, "utf8")) as NoEnvConfig, path: p };
}

export function saveProjectConfig(filePath: string, config: NoEnvConfig): void {
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
}

export function defaultProjectConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, PROJECT_CONFIG_NAME);
}

export { DEFAULT_DB_PATH };
