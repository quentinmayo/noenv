import fs from "node:fs";
import path from "node:path";
import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt } from "../cli/opts.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { requireGlobal, buildProviders, firstWritable, resolveProjectName } from "../core/session.js";
import { parseDotenv } from "../util/dotenv.js";
import { ensureGitignore } from "../util/gitignore.js";

export async function run(p: ParsedCommand): Promise<number> {
  const file = p.positionals[0] ?? ".env";
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    log.error(`File not found: ${file}`);
    return 1;
  }

  const config = loadProjectConfig()?.config ?? null;
  const global = requireGlobal(config);
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";

  const vars = parseDotenv(fs.readFileSync(filePath, "utf8"));
  const keys = Object.keys(vars);
  if (keys.length === 0) {
    log.warn(`No variables found in ${file}.`);
    return 0;
  }

  const providers = await buildProviders(config, global);
  try {
    const writer = firstWritable(providers);
    for (const key of keys) {
      await writer.set({ project, key, mode, value: vars[key]!, secret: true });
    }
    log.success(`Imported ${keys.length} variable(s) into ${project}/${mode} [encrypted].`);
  } finally {
    providers.forEach((pr) => pr.close());
  }

  const added = ensureGitignore(path.join(process.cwd(), ".gitignore"), [path.basename(file)]);
  if (added.length) log.success(`Added ${added.join(", ")} to .gitignore.`);

  log.info("");
  log.warn("Finish the migration so the plaintext file is gone for good:");
  log.info(`  1. Delete the local file:      rm ${file}`);
  log.info(`  2. If it was ever committed:   git rm --cached ${file}`);
  log.info("  3. If it was committed with real secrets, rotate them and scrub history");
  log.info("     (e.g. git filter-repo). Removing from HEAD does NOT remove from history.");
  return 0;
}
