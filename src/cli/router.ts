import type { ParsedCommand } from "./parse.js";
import { setVerbose, log } from "./output.js";

type CommandModule = { run(p: ParsedCommand): Promise<number> };

export async function route(parsed: ParsedCommand): Promise<number> {
  setVerbose(Boolean(parsed.options["verbose"]));

  const load = async (path: string): Promise<CommandModule> =>
    (await import(path)) as CommandModule;

  switch (parsed.command) {
    case "help": return (await load("../commands/help.js")).run(parsed);
    case "version": return (await load("../commands/version.js")).run(parsed);
    case "init": return (await load("../commands/init.js")).run(parsed);
    case "run": return (await load("../commands/run.js")).run(parsed);
    case "set": return (await load("../commands/set.js")).run(parsed);
    case "get": return (await load("../commands/get.js")).run(parsed);
    case "list": return (await load("../commands/list.js")).run(parsed);
    case "remove":
    case "rm": return (await load("../commands/remove.js")).run(parsed);
    case "import": return (await load("../commands/import.js")).run(parsed);
    case "context": return (await load("../commands/context.js")).run(parsed);
    case "export": return (await load("../commands/export.js")).run(parsed);
    case "doctor": return (await load("../commands/doctor.js")).run(parsed);
    case "schema": return (await load("../commands/schema.js")).run(parsed);
    case "login":
    case "logout":
    case "server": return (await load("../commands/stub.js")).run(parsed);
    default:
      log.error(`Unknown command: ${parsed.command}`);
      log.info("Did you forget `--` before your command? e.g. `noenv -- npm run dev`");
      log.info("Run `noenv help` for usage.");
      return 1;
  }
}
