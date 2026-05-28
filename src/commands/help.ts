import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { VERSION } from "./version.js";

const HELP = `NoEnv v${VERSION} — run commands with secrets, without committing secrets.

USAGE
  noenv [options] -- <command> [args...]   Resolve env vars and run a command
  noenv <subcommand> [args] [options]

RUN
  noenv -- npm run dev                      Resolve + inject, then run
  noenv --mode staging -- npm test          Use an explicit mode
  noenv --dry-run -- npm run dev            Show the plan, run nothing

SECRETS
  noenv init                                Set up NoEnv in this project
  noenv set <KEY> [--mode m] [--value v]    Store a secret (prompted if no --value)
  noenv get <KEY> [--mode m] [--redact]     Read one secret
  noenv list [--mode m]                     List keys (never values)
  noenv remove <KEY> [--mode m] [--yes]     Delete a secret
  noenv import <.env> [--mode m]            Import an existing .env into the store

CONTEXT
  noenv context [detect]                    Show context + resolved mode
  noenv context add-network <name> <cidr> [--mode m]
  noenv context add-git <remote> --project <p>

SCHEMA (optional)
  noenv schema init | validate | generate-env | docs

EXPORT (legacy-tool bridge)
  noenv export [--format dotenv|json|shell] [--redact]
  noenv export --temporary -- <command>    Write temp .env, run, then delete

OTHER
  noenv doctor                              Diagnose setup
  noenv --version | --help

OPTIONS
  --mode <m>      Explicit mode (default: project defaultMode)
  --project <p>   Override project name
  --dry-run       Show what would run, without running
  --verbose, -v   Verbose resolution logging (to stderr)
`;

export async function run(_p: ParsedCommand): Promise<number> {
  log.out(HELP);
  return 0;
}
