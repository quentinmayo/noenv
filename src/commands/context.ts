import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt } from "../cli/opts.js";
import { loadProjectConfig, loadGlobalConfig, saveProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { resolveMode } from "../modes/resolve.js";
import type { NoEnvConfig } from "../types.js";

function loadOrFail(): { config: NoEnvConfig; path: string } | null {
  return loadProjectConfig();
}

export async function run(p: ParsedCommand): Promise<number> {
  const sub = p.positionals[0];

  if (!sub || sub === "detect") {
    const context = buildContext();
    const config = loadProjectConfig()?.config ?? null;
    const global = loadGlobalConfig();
    const resolution = resolveMode({ flag: strOpt(p, "mode"), config, global, context });
    context.mode = resolution.mode;
    log.out(JSON.stringify(context, null, 2));
    log.info("");
    log.info(`Resolved mode: ${resolution.ambiguous ? "(ambiguous)" : resolution.mode} via ${resolution.source}`);
    if (resolution.candidates.length > 1) {
      log.info("Candidates (in precedence order):");
      resolution.candidates.forEach((c) => log.info(`  ${c.source} -> ${c.mode}`));
    }
    return 0;
  }

  if (sub === "add-network") {
    const name = p.positionals[1];
    const cidr = p.positionals[2];
    if (!name || !cidr) {
      log.error("usage: noenv context add-network <name> <cidr> [--mode <mode>]");
      return 1;
    }
    const loaded = loadOrFail();
    if (!loaded) {
      log.error("No project config found. Run `noenv init` first.");
      return 1;
    }
    const cfg = loaded.config;
    cfg.rules ??= {};
    cfg.rules.network ??= [];
    cfg.rules.network.push({ name, cidr, mode: strOpt(p, "mode") ?? name, enabled: true });
    saveProjectConfig(loaded.path, cfg);
    log.success(`Added network rule "${name}" (${cidr} -> ${strOpt(p, "mode") ?? name}), enabled.`);
    return 0;
  }

  if (sub === "add-git") {
    const remote = p.positionals[1];
    const project = strOpt(p, "project");
    if (!remote || !project) {
      log.error("usage: noenv context add-git <remote> --project <project>");
      return 1;
    }
    const loaded = loadOrFail();
    if (!loaded) {
      log.error("No project config found. Run `noenv init` first.");
      return 1;
    }
    const cfg = loaded.config;
    cfg.rules ??= {};
    cfg.rules.git ??= [];
    cfg.rules.git.push({ remote, project });
    saveProjectConfig(loaded.path, cfg);
    log.success(`Mapped ${remote} -> project "${project}".`);
    return 0;
  }

  log.error(`Unknown context subcommand: ${sub}`);
  return 1;
}
