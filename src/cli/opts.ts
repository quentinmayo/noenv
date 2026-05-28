import type { ParsedCommand } from "./parse.js";

export function strOpt(p: ParsedCommand, name: string): string | undefined {
  const v = p.options[name];
  return typeof v === "string" ? v : undefined;
}

/** True when a flag is present in any form (`--flag` or `--flag=...`). */
export function boolOpt(p: ParsedCommand, name: string): boolean {
  return name in p.options;
}
