import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";

/** Placeholder for V1 server/auth commands, wired against the same CLI surface. */
export async function run(p: ParsedCommand): Promise<number> {
  log.warn(`\`noenv ${p.command}\` is part of the team/server feature set (V1) and is not implemented in v0.1.`);
  log.info("v0.1 is local-first: try `noenv init`, `noenv set`, and `noenv -- <command>`.");
  return 0;
}
