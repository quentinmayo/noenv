import fs from "node:fs";
import path from "node:path";
import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt } from "../cli/opts.js";
import { SCHEMA_NAME } from "../config/paths.js";
import { loadProjectConfig } from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { requireGlobal, buildProviders, resolveProjectName } from "../core/session.js";
import type { SecretValue } from "../types.js";

interface SchemaVar {
  type?: "string" | "number" | "boolean";
  required?: boolean;
  secret?: boolean;
  description?: string;
  default?: string | number | boolean;
}
interface Schema {
  variables: Record<string, SchemaVar>;
}

const TEMPLATE: Schema = {
  variables: {
    DATABASE_URL: { type: "string", required: true, secret: true, description: "Primary database connection string" },
    APP_PORT: { type: "number", required: false, default: 3000, description: "Local app port" },
  },
};

function schemaPath(): string {
  return path.resolve(process.cwd(), SCHEMA_NAME);
}

function loadSchema(): Schema | null {
  try {
    return JSON.parse(fs.readFileSync(schemaPath(), "utf8")) as Schema;
  } catch {
    return null;
  }
}

async function resolveVars(p: ParsedCommand): Promise<Record<string, string>> {
  const global = requireGlobal();
  const config = loadProjectConfig()?.config ?? null;
  const context = buildContext();
  const project = resolveProjectName({ flag: strOpt(p, "project"), config, context });
  const mode = strOpt(p, "mode") ?? config?.defaultMode ?? "local";
  const providers = await buildProviders(config, global);
  try {
    const all = (await Promise.all(providers.map((pr) => pr.resolveAll({ project, mode })))).flat();
    const map = new Map<string, SecretValue>();
    for (const sv of all) if (!map.has(sv.key)) map.set(sv.key, sv);
    return Object.fromEntries([...map.values()].map((sv) => [sv.key, sv.value]));
  } finally {
    providers.forEach((pr) => pr.close());
  }
}

export async function run(p: ParsedCommand): Promise<number> {
  const sub = p.positionals[0] ?? "validate";

  if (sub === "init") {
    if (fs.existsSync(schemaPath())) {
      log.error(`${SCHEMA_NAME} already exists.`);
      return 1;
    }
    fs.writeFileSync(schemaPath(), JSON.stringify(TEMPLATE, null, 2) + "\n");
    log.success(`Wrote ${SCHEMA_NAME}.`);
    return 0;
  }

  const schema = loadSchema();
  if (!schema) {
    log.error(`No ${SCHEMA_NAME} found. Run \`noenv schema init\` first.`);
    return 1;
  }

  if (sub === "generate-env") {
    for (const [key, v] of Object.entries(schema.variables)) {
      if (v.default !== undefined) log.out(`${key}=${JSON.stringify(String(v.default))}`);
      else {
        const tag = v.required ? "required" : "optional";
        log.out(`${key}=${JSON.stringify(`<${tag}:${v.secret ? "secret" : v.type ?? "string"}>`)}`);
      }
    }
    return 0;
  }

  if (sub === "docs") {
    log.out("| Variable | Type | Required | Secret | Description |");
    log.out("| --- | --- | --- | --- | --- |");
    for (const [key, v] of Object.entries(schema.variables)) {
      log.out(
        `| \`${key}\` | ${v.type ?? "string"} | ${v.required ? "yes" : "no"} | ${v.secret ? "yes" : "no"} | ${v.description ?? ""} |`,
      );
    }
    return 0;
  }

  if (sub === "validate") {
    const vars = await resolveVars(p);
    let problems = 0;
    for (const [key, v] of Object.entries(schema.variables)) {
      const present = key in vars;
      if (v.required && !present) {
        log.error(`missing required variable: ${key}`);
        problems++;
        continue;
      }
      if (present && v.type === "number" && Number.isNaN(Number(vars[key]))) {
        log.error(`${key} should be a number, got "${vars[key]}"`);
        problems++;
      }
    }
    if (problems === 0) {
      log.success("Schema validation passed.");
      return 0;
    }
    log.error(`${problems} problem(s) found.`);
    return 1;
  }

  log.error(`Unknown schema subcommand: ${sub}`);
  return 1;
}
