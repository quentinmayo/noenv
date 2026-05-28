import type { ParsedCommand } from "../cli/parse.js";
import { log, redact } from "../cli/output.js";
import { strOpt, boolOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { requireGlobal, buildProviders, resolveProjectName } from "../core/session.js";

export async function run(p: ParsedCommand): Promise<number> {
  const key = p.positionals[0];
  if (!key) {
    log.error("usage: noenv get <KEY> [--mode <mode>] [--redact]");
    return 1;
  }

  const global = requireGlobal();
  const config = loadProjectConfig()?.config ?? null;
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";

  const providers = await buildProviders(config, global);
  try {
    for (const provider of providers) {
      const sv = await provider.getSecret({ project, key, mode });
      if (sv) {
        log.out(boolOpt(p, "redact") ? redact(sv.value) : sv.value);
        return 0;
      }
    }
    log.error(`${key} not found for ${project}/${mode}.`);
    return 1;
  } finally {
    providers.forEach((pr) => pr.close());
  }
}
