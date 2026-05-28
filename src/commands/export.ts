import fs from "node:fs";
import path from "node:path";
import type { ParsedCommand } from "../cli/parse.js";
import { log, redact } from "../cli/output.js";
import { strOpt, boolOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { requireGlobal, buildProviders, resolveProjectName } from "../core/session.js";
import { toDotenv, toShell } from "../util/dotenv.js";
import { ensureGitignore } from "../util/gitignore.js";
import { spawnChild } from "../util/spawn.js";
import type { SecretValue } from "../types.js";

async function resolveVars(p: ParsedCommand): Promise<Record<string, string>> {
  const global = requireGlobal();
  const config = loadProjectConfig()?.config ?? null;
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";

  const providers = await buildProviders(config, global);
  try {
    const all = (
      await Promise.all(providers.map((pr) => pr.resolveAll({ project, mode })))
    ).flat();
    const map = new Map<string, SecretValue>();
    for (const sv of all) if (!map.has(sv.key)) map.set(sv.key, sv);
    return Object.fromEntries([...map.values()].map((sv) => [sv.key, sv.value]));
  } finally {
    providers.forEach((pr) => pr.close());
  }
}

function format(vars: Record<string, string>, fmt: string, doRedact: boolean): string {
  const out = doRedact
    ? Object.fromEntries(Object.keys(vars).map((k) => [k, redact(vars[k]!)]))
    : vars;
  switch (fmt) {
    case "json":
      return JSON.stringify(out, null, 2) + "\n";
    case "shell":
      return toShell(out);
    case "dotenv":
    default:
      return toDotenv(out);
  }
}

export async function run(p: ParsedCommand): Promise<number> {
  const fmt = strOpt(p, "format") ?? "dotenv";

  // --temporary -- <command>: write a temp .env, run, then delete.
  if (boolOpt(p, "temporary")) {
    const child = p.childArgv;
    if (!child || child.length === 0) {
      log.error("usage: noenv export --temporary -- <command> [args...]");
      return 1;
    }
    const target = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(target) && !boolOpt(p, "force")) {
      log.error(".env already exists; refusing to overwrite. Use --force to override.");
      return 1;
    }
    const vars = await resolveVars(p);
    ensureGitignore(path.join(process.cwd(), ".gitignore"), [".env"]);
    fs.writeFileSync(target, toDotenv(vars), { mode: 0o600 });
    log.warn(`Wrote temporary .env (${Object.keys(vars).length} vars). It will be deleted after the command exits.`);
    try {
      return await spawnChild(child, process.env);
    } finally {
      try {
        fs.unlinkSync(target);
        log.success("Deleted temporary .env.");
      } catch {
        log.error("Could not delete temporary .env — remove it manually!");
      }
    }
  }

  const vars = await resolveVars(p);
  const doRedact = boolOpt(p, "redact");
  if (!doRedact && process.stdout.isTTY) {
    log.warn("Printing real secret values to the terminal. Use --redact to mask, or pipe to a file you control.");
  }
  process.stdout.write(format(vars, fmt, doRedact));
  return 0;
}
