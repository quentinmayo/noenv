import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt, boolOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { password } from "../cli/prompt.js";
import { requireGlobal, buildProviders, firstWritable, resolveProjectName } from "../core/session.js";

export async function run(p: ParsedCommand): Promise<number> {
  const key = p.positionals[0];
  if (!key) {
    log.error("usage: noenv set <KEY> [--mode <mode>] [--value <value>] [--plain]");
    return 1;
  }

  const global = requireGlobal();
  const config = loadProjectConfig()?.config ?? null;
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";

  const value = strOpt(p, "value") ?? (await password(`Value for ${key} (${project}/${mode}): `));
  if (!value) {
    log.error("No value provided.");
    return 1;
  }

  const providers = await buildProviders(config, global);
  try {
    await firstWritable(providers).set({
      project,
      key,
      mode,
      value,
      secret: !boolOpt(p, "plain"),
    });
    log.success(`Set ${key} for ${project}/${mode} [stored encrypted].`);
  } finally {
    providers.forEach((pr) => pr.close());
  }
  return 0;
}
