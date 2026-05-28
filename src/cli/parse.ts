export interface ParsedCommand {
  command: string;
  /** Tokens after `--`, i.e. the child command to run. `null` when no `--` present. */
  childArgv: string[] | null;
  options: Record<string, string | boolean>;
  positionals: string[];
}

const KNOWN_COMMANDS = new Set([
  "init", "run", "set", "get", "list", "remove", "rm", "import",
  "context", "export", "doctor", "schema", "login", "logout", "server",
  "help", "version",
]);

/** Flags that consume the following token as their value. Everything else is boolean. */
const VALUE_FLAGS = new Set([
  "mode", "project", "format", "value", "provider", "path", "name", "cidr", "db",
]);

/**
 * Parse `noenv` argv. The defining rule: the first standalone `--` splits NoEnv's
 * own options from the child command. `noenv -- npm run dev` is implicit `run`.
 */
export function parseArgv(argv: string[]): ParsedCommand {
  const ddIndex = argv.indexOf("--");
  const head = ddIndex >= 0 ? argv.slice(0, ddIndex) : argv;
  const childArgv = ddIndex >= 0 ? argv.slice(ddIndex + 1) : null;

  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < head.length; i++) {
    const tok = head[i]!;
    if (tok.startsWith("--")) {
      const body = tok.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        options[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (VALUE_FLAGS.has(body)) {
        const next = head[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          options[body] = next;
          i++;
          continue;
        }
      }
      options[body] = true;
    } else if (tok.startsWith("-") && tok.length > 1) {
      const short = tok.slice(1);
      if (short === "v") options["verbose"] = true;
      else if (short === "h") options["help"] = true;
      else if (short === "V") options["version"] = true;
      else options[short] = true;
    } else {
      positionals.push(tok);
    }
  }

  let command: string;
  if (positionals.length > 0 && KNOWN_COMMANDS.has(positionals[0]!)) {
    command = positionals.shift()!;
  } else if (childArgv !== null) {
    command = "run";
  } else if (options["version"]) {
    command = "version";
  } else if (options["help"] || positionals.length === 0) {
    command = "help";
  } else {
    command = positionals[0]!; // unknown — router reports the error
  }

  return { command, childArgv, options, positionals };
}
