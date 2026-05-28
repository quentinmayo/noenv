/**
 * Core shared types for NoEnv.
 *
 * Kept dependency-free and provider-agnostic so the CLI, the local store, and
 * future remote providers all speak the same vocabulary.
 */

export type Mode = string;

export interface GitContext {
  /** Normalized remote, e.g. "github.com/owner/repo" (host + path, no scheme/.git). */
  remote?: string;
  /** Raw remote URL as reported by git. */
  rawRemote?: string;
  branch?: string;
  sha?: string;
  root?: string;
}

export interface NetworkContext {
  ip?: string;
  /** Name of the matched network rule, if any. */
  cidrMatch?: string;
}

/**
 * Everything NoEnv knows about "who and where" before it resolves secrets.
 * Printable via `noenv context` and `--dry-run`.
 */
export interface NoEnvContext {
  cwd: string;
  hostname: string;
  username: string;
  git: GitContext;
  network: NetworkContext;
  mode: Mode;
  ci: boolean;
}

/** A resolved secret value plus where it came from (for audit/verbose, never logged in the clear). */
export interface SecretValue {
  key: string;
  value: string;
  /** Name of the provider that resolved it. */
  provider: string;
  /** Whether the value should be treated as sensitive (redacted in output). */
  secret: boolean;
}

/** Metadata about a secret, safe to display (no value). */
export interface SecretMetadata {
  key: string;
  mode?: string;
  secret: boolean;
  provider?: string;
  updatedAt?: string;
}

export type KeyProviderId = "keychain" | "passphrase";

export interface ProviderConfig {
  /** Logical name used in resolution logs, e.g. "local". */
  name: string;
  /** Provider implementation type, e.g. "sqlite". */
  type: string;
  /** Optional path (for file/sqlite providers). */
  path?: string;
  [key: string]: unknown;
}

export interface GitRule {
  /** Normalized remote to match, e.g. "github.com/acme/api". */
  remote: string;
  project: string;
}

export interface NetworkRule {
  name: string;
  /** IPv4 CIDR, e.g. "192.168.1.0/24". */
  cidr?: string;
  mode: string;
  /** Opt-in: network rules do not drive resolution unless enabled. */
  enabled?: boolean;
}

export interface BranchRule {
  /** Glob-ish branch pattern, e.g. "release/*" or "main". */
  pattern: string;
  mode: string;
  /** Opt-in: branch rules do not drive resolution unless enabled. */
  enabled?: boolean;
}

/** Committed, secret-free project configuration (noenv.config.json). */
export interface NoEnvConfig {
  project: string;
  defaultMode: string;
  providers: ProviderConfig[];
  rules?: {
    git?: GitRule[];
    network?: NetworkRule[];
    branch?: BranchRule[];
  };
  /** Modes that require explicit confirmation before running. */
  sensitiveModes?: string[];
}

/** Per-user global state (~/.noenv/config.json). Non-secret. */
export interface GlobalConfig {
  keyProvider: KeyProviderId;
  /** base64 salt used to derive the passphrase KEK (non-secret). */
  passphraseSalt?: string;
  /** base64 verifier: a known plaintext encrypted with the master key, to validate the passphrase. */
  passphraseVerifier?: string;
  defaultMode?: string;
  /** Absolute path to the local SQLite store. */
  dbPath?: string;
}
