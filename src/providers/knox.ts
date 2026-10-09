import { execFile } from "node:child_process";
import type { ProviderConfig, SecretMetadata, SecretValue } from "../types.js";
import type { SecretProvider, ResolveOneInput, ScopeInput, SetInput, RemoveInput } from "./types.js";

type Bindings = Map<string, Map<string, Map<string, string>>>;
const MAX_OUTPUT = 1024 * 1024;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read-only adapter for a trusted, deployment-configured native Knox client. */
export class KnoxProvider implements SecretProvider {
  readonly writable = false;
  readonly name: string;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly projects: Bindings = new Map();
  private readonly pending = new Set<AbortController>();
  private closed = false;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    const command = process.env.NOENV_KNOX_COMMAND ?? config.command ?? "knox";
    if (typeof command !== "string" || !command || command.includes("\0")) {
      throw new Error("Knox command must be an executable name or path.");
    }
    this.command = command;
    const timeout = config.timeoutMs ?? 10000;
    if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1 || timeout > 120000) {
      throw new Error("Knox timeoutMs must be an integer from 1 to 120000.");
    }
    this.timeoutMs = timeout;
    if (!object(config.projects) || Object.keys(config.projects).length === 0) {
      throw new Error("Knox projects must contain explicit project/mode/key mappings.");
    }
    for (const [project, modes] of Object.entries(config.projects)) {
      if (!project || !object(modes) || !Object.keys(modes).length) {
        throw new Error("Invalid Knox project mapping.");
      }
      const modeMap = new Map<string, Map<string, string>>();
      for (const [mode, keys] of Object.entries(modes)) {
        if (!mode || !object(keys) || !Object.keys(keys).length) {
          throw new Error("Each Knox mode must contain at least one key mapping.");
        }
        const keyMap = new Map<string, string>();
        for (const [key, id] of Object.entries(keys)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
              typeof id !== "string" || !/^[A-Za-z0-9_:]+$/.test(id)) {
            throw new Error("Invalid Knox environment name or key ID in mapping.");
          }
          keyMap.set(key, id);
        }
        modeMap.set(mode, keyMap);
      }
      this.projects.set(project, modeMap);
    }
  }

  private scope(input: ScopeInput): Map<string, string> {
    if (this.closed) throw new Error("Knox provider is closed.");
    const keys = this.projects.get(input.project)?.get(input.mode);
    if (!keys) throw new Error("No Knox mapping for the selected project/mode; configure it explicitly.");
    return keys;
  }

  async getSecret(input: ResolveOneInput): Promise<SecretValue | null> {
    const id = this.scope(input).get(input.key);
    if (id === undefined) return null;
    const controller = new AbortController();
    this.pending.add(controller);
    try {
      const bytes = await new Promise<Buffer>((resolve, reject) => {
        const child = execFile(this.command, ["get", "-n", id], {
          encoding: "buffer", timeout: this.timeoutMs, maxBuffer: MAX_OUTPUT,
          killSignal: "SIGKILL", signal: controller.signal, windowsHide: true,
        }, (err, stdout) => {
          // execFile errors contain captured output: never propagate them.
          if (err) reject(new Error("Knox read failed (client, access, network, timeout, or output limit); child command was not launched."));
          else resolve(stdout);
        });
        child.stdin?.end();
      });
      let value: string;
      try {
        value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        if (value.includes("\0")) throw new Error("NUL");
      } catch {
        throw new Error("Knox value must be valid UTF-8 without NUL bytes for environment injection.");
      }
      return { key: input.key, value, provider: this.name, secret: true };
    } finally {
      this.pending.delete(controller);
    }
  }

  async resolveAll(input: ScopeInput): Promise<SecretValue[]> {
    const values: SecretValue[] = [];
    // Sequential reads bound subprocess count and stop at the first failure.
    for (const key of this.scope(input).keys()) {
      values.push((await this.getSecret({ ...input, key }))!);
    }
    return values;
  }

  async list(input: ScopeInput): Promise<SecretMetadata[]> {
    return [...this.scope(input).keys()].map((key) => ({
      key, mode: input.mode, provider: this.name, secret: true,
    }));
  }

  async set(_input: SetInput): Promise<void> {
    throw new Error("Knox is read-only in NoEnv; use Knox tooling to change values.");
  }

  async remove(_input: RemoveInput): Promise<boolean> {
    throw new Error("Knox is read-only in NoEnv; use Knox tooling to remove values.");
  }

  close(): void {
    this.closed = true;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }
}
