import path from "node:path";
import type { GlobalConfig, NoEnvConfig, NoEnvContext } from "../types.js";
import { loadGlobalConfig, DEFAULT_DB_PATH } from "../config/config.js";
import { createKeyProvider } from "../crypto/keyprovider.js";
import { createCipher, ENC_ALG, type Cipher } from "../crypto/envelope.js";
import { LocalSqliteProvider } from "../providers/local-sqlite.js";
import type { SecretProvider } from "../providers/types.js";
import { password } from "../cli/prompt.js";

/** Known plaintext encrypted at init to validate a passphrase later. */
export const VERIFIER_PLAINTEXT = "noenv-verifier-v1";

export function requireGlobal(): GlobalConfig {
  const g = loadGlobalConfig();
  if (!g) throw new Error("NoEnv is not initialized here. Run `noenv init` first.");
  return g;
}

/** Build a cipher from the configured key provider, validating the passphrase if applicable. */
export async function getCipher(global: GlobalConfig): Promise<Cipher> {
  const kp = createKeyProvider(global, {
    promptPassphrase: () => password("NoEnv passphrase: "),
  });
  const key = await kp.getMasterKey();
  const cipher = createCipher(kp.keyId, key);

  if (global.keyProvider === "passphrase" && global.passphraseVerifier) {
    try {
      if (cipher.decrypt({ alg: ENC_ALG, ciphertext: global.passphraseVerifier }) !== VERIFIER_PLAINTEXT) {
        throw new Error("mismatch");
      }
    } catch {
      throw new Error("Incorrect passphrase.");
    }
  }
  return cipher;
}

export async function buildProviders(
  config: NoEnvConfig | null,
  global: GlobalConfig,
): Promise<SecretProvider[]> {
  const cipher = await getCipher(global);
  const dbPath = global.dbPath ?? DEFAULT_DB_PATH;
  const providerConfigs = config?.providers ?? [{ name: "local", type: "sqlite", path: dbPath }];

  const providers: SecretProvider[] = [];
  for (const pc of providerConfigs) {
    if (pc.type === "sqlite") {
      providers.push(new LocalSqliteProvider(pc.name, pc.path ?? dbPath, cipher));
    } else {
      throw new Error(`unknown provider type "${pc.type}" (only "sqlite" is supported in v0.1)`);
    }
  }
  return providers;
}

/** The first writable provider, for set/remove/import operations. */
export function firstWritable(providers: SecretProvider[]): SecretProvider {
  const w = providers.find((p) => p.writable);
  if (!w) throw new Error("no writable provider configured");
  return w;
}

/** Determine the project name from flag > git rule > config > git repo name > cwd. */
export function resolveProjectName(opts: {
  flag?: string;
  config?: NoEnvConfig | null;
  context: NoEnvContext;
}): string {
  if (opts.flag) return opts.flag;
  const remote = opts.context.git.remote;
  const gitRule = remote ? opts.config?.rules?.git?.find((r) => r.remote === remote) : undefined;
  if (gitRule) return gitRule.project;
  if (opts.config?.project) return opts.config.project;
  if (remote) return remote.split("/").pop() || remote;
  return path.basename(opts.context.cwd);
}
