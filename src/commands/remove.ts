import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt, boolOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { confirm } from "../cli/prompt.js";
import { requireGlobal, buildProviders, firstWritable, resolveProjectName } from "../core/session.js";

export async function run(p: ParsedCommand): Promise<number> {
  const key = p.positionals[0];
  if (!key) {
    log.error("usage: noenv remove <KEY> [--mode <mode>] [--yes]");
    return 1;
  }

  const global = requireGlobal();
  const config = loadProjectConfig()?.config ?? null;
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";

  if (!boolOpt(p, "yes")) {
    const ok = await confirm(`Remove ${key} from ${project}/${mode}?`, false);
    if (!ok) {
      log.info("Aborted.");
      return 1;
    }
  }

  const providers = await buildProviders(config, global);
  try {
    const removed = await firstWritable(providers).remove({ project, key, mode });
    if (removed) log.success(`Removed ${key} from ${project}/${mode}.`);
    else log.warn(`${key} not found for ${project}/${mode}.`);
    return removed ? 0 : 1;
  } finally {
    providers.forEach((pr) => pr.close());
  }
}
