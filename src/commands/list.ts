import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { requireGlobal, buildProviders, resolveProjectName } from "../core/session.js";
import type { SecretMetadata } from "../types.js";

export async function run(p: ParsedCommand): Promise<number> {
  const config = loadProjectConfig()?.config ?? null;
  const global = requireGlobal(config);
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";

  const providers = await buildProviders(config, global);
  try {
    const seen = new Map<string, SecretMetadata>();
    for (const provider of providers) {
      for (const meta of await provider.list({ project, mode })) {
        if (!seen.has(meta.key)) seen.set(meta.key, meta);
      }
    }
    if (seen.size === 0) {
      log.info(`No secrets for ${project}/${mode}.`);
      return 0;
    }
    log.info(`Secrets for ${project}/${mode} (${seen.size}):`);
    for (const meta of seen.values()) {
      const tag = meta.secret ? "secret" : "plain";
      log.out(`  ${meta.key}  [${tag}] (${meta.provider})`);
    }
    return 0;
  } finally {
    providers.forEach((pr) => pr.close());
  }
}
