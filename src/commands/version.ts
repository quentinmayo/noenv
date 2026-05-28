import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";

export const VERSION = "0.1.0";

export async function run(_p: ParsedCommand): Promise<number> {
  log.out(VERSION);
  return 0;
}
