import { applicationEnvironment } from "../util/environment.js";
import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt, boolOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { resolveMode } from "../modes/resolve.js";
import { confirm } from "../cli/prompt.js";
import { requireGlobal, buildProviders, resolveProjectName } from "../core/session.js";
import { spawnChild } from "../util/spawn.js";
import type { SecretValue } from "../types.js";

export async function run(p: ParsedCommand): Promise<number> {
  const child = p.childArgv;
  if (!child || child.length === 0) {
    log.error("usage: noenv [--mode <mode>] [--dry-run] -- <command> [args...]");
    return 1;
  }

  const config = loadProjectConfig()?.config ?? null;
  const global = requireGlobal(config);
  const context = buildContext();

  const resolution = resolveMode({ flag: strOpt(p, "mode"), config, global, context });
  if (resolution.ambiguous) {
    log.error("Ambiguous mode — branch and network rules disagree:");
    resolution.candidates.forEach((c) => log.info(`  ${c.source} -> ${c.mode}`));
    log.info("Pass --mode to choose explicitly.");
    return 1;
  }
  context.mode = resolution.mode;
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const sensitive = (config?.sensitiveModes ?? []).includes(resolution.mode);

  const providers = await buildProviders(config, global);
  try {
    const all = (
      await Promise.all(providers.map((pr) => pr.resolveAll({ project, mode: resolution.mode })))
    ).flat();

    // First provider wins on key conflicts.
    const map = new Map<string, SecretValue>();
    for (const sv of all) if (!map.has(sv.key)) map.set(sv.key, sv);

    log.verbose(`project=${project} mode=${resolution.mode} (via ${resolution.source})`);
    for (const sv of map.values()) log.verbose(`resolved ${sv.key} from ${sv.provider} [redacted]`);

    if (boolOpt(p, "dry-run")) {
      log.info("Plan (dry run) — nothing will be executed:");
      log.info(`  command: ${child.join(" ")}`);
      log.info(`  project: ${project}`);
      log.info(`  mode:    ${resolution.mode} (via ${resolution.source})`);
      log.info(`  vars:    ${[...map.keys()].join(", ") || "(none)"}`);
      return 0;
    }

    if (map.size === 0) {
      log.warn(`No secrets found for ${project}/${resolution.mode}; running with current env only.`);
    }

    if (sensitive && !context.ci) {
      const ok = await confirm(`Mode "${resolution.mode}" is marked sensitive. Continue?`, false);
      if (!ok) {
        log.info("Aborted.");
        return 1;
      }
    }

    const env = applicationEnvironment();
    for (const sv of map.values()) env[sv.key] = sv.value;

    log.info(`Running: ${child.join(" ")}`);
    return await spawnChild(child, env);
  } finally {
    providers.forEach((pr) => pr.close());
  }
}
