import type { NoEnvContext, SecretMetadata, SecretValue } from "../types.js";

export interface ResolveOneInput {
  project: string;
  key: string;
  mode: string;
  context?: NoEnvContext;
}

export interface ScopeInput {
  project: string;
  mode: string;
}

export interface SetInput {
  project: string;
  key: string;
  mode: string;
  value: string;
  secret?: boolean;
}

export interface RemoveInput {
  project: string;
  key: string;
  mode: string;
}

/**
 * A source of secret values. The local SQLite store is the only writable
 * provider in v0.1; remote providers (broker, AWS, 1Password, ...) implement the
 * same read surface so the CLI never needs to know where a value lives.
 */
export interface SecretProvider {
  readonly name: string;
  readonly writable: boolean;

  getSecret(input: ResolveOneInput): Promise<SecretValue | null>;
  resolveAll(input: ScopeInput): Promise<SecretValue[]>;
  list(input: ScopeInput): Promise<SecretMetadata[]>;

  /** Writable providers only; throws otherwise. */
  set(input: SetInput): Promise<void>;
  remove(input: RemoveInput): Promise<boolean>;

  close(): void;
}
