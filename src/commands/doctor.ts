import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { loadGlobalConfig, loadProjectConfig, DEFAULT_DB_PATH } from "../config/config.js";
import { keychainAvailable } from "../crypto/keyprovider.js";
import { getCipher } from "../core/session.js";

interface Check {
  name: string;
  ok: boolean | "warn";
  detail?: string;
}

export async function run(_p: ParsedCommand): Promise<number> {
  const checks: Check[] = [];

  const major = Number(process.versions.node.split(".")[0] ?? "0");
  checks.push({ name: "Node >= 22", ok: major >= 22, detail: process.version });

  let gitOk = false;
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    gitOk = true;
  } catch {
    /* not found */
  }
  checks.push({
    name: "git available",
    ok: gitOk ? true : "warn",
    detail: gitOk ? undefined : "git context detection disabled",
  });

  const global = loadGlobalConfig();
  checks.push({
    name: "NoEnv initialized",
    ok: global ? true : false,
    detail: global ? `key custody: ${global.keyProvider}` : "run `noenv init`",
  });

  const kc = await keychainAvailable();
  checks.push({
    name: "OS keychain",
    ok: kc ? true : "warn",
    detail: kc ? undefined : "not available; passphrase fallback in use if configured",
  });

  const proj = loadProjectConfig();
  checks.push({
    name: "project config",
    ok: proj ? true : "warn",
    detail: proj ? path.basename(proj.path) : "no noenv.config.json found",
  });

  let gi = "";
  try {
    gi = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
  } catch {
    /* none */
  }
  checks.push({
    name: ".gitignore covers .env",
    ok: gi.includes(".env") ? true : "warn",
    detail: gi.includes(".env") ? undefined : "add `.env` to .gitignore",
  });

  if (global) {
    try {
      const cipher = await getCipher(global);
      const roundTrip = cipher.decrypt(cipher.encrypt("noenv-doctor"));
      checks.push({ name: "encryption round-trip", ok: roundTrip === "noenv-doctor" });
      checks.push({ name: "store path", ok: true, detail: global.dbPath ?? DEFAULT_DB_PATH });
    } catch (e) {
      checks.push({ name: "encryption round-trip", ok: false, detail: (e as Error).message });
    }
  }

  let failed = 0;
  for (const c of checks) {
    const sym = c.ok === true ? "✓" : c.ok === "warn" ? "!" : "✗";
    if (c.ok === false) failed++;
    log.info(`${sym} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  log.info("");
  log.info(failed > 0 ? `${failed} check(s) failed.` : "All good.");
  return failed > 0 ? 1 : 0;
}
