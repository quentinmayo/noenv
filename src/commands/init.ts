import path from "node:path";
import type { ParsedCommand } from "../cli/parse.js";
import { log } from "../cli/output.js";
import { strOpt, boolOpt } from "../cli/opts.js";
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadProjectConfig,
  saveProjectConfig,
  defaultProjectConfigPath,
  DEFAULT_DB_PATH,
} from "../config/config.js";
import { buildContext } from "../context/detect.js";
import { resolveProjectName, VERIFIER_PLAINTEXT } from "../core/session.js";
import { keychainAvailable, createKeyProvider, newPassphraseSalt } from "../crypto/keyprovider.js";
import { createCipher } from "../crypto/envelope.js";
import { password, question } from "../cli/prompt.js";
import { ensureGitignore } from "../util/gitignore.js";
import type { GlobalConfig, NoEnvConfig, KeyProviderId } from "../types.js";

export async function run(p: ParsedCommand): Promise<number> {
  const cwd = process.cwd();
  const context = buildContext(cwd);
  const defaultName = resolveProjectName({ context });

  const projectName =
    strOpt(p, "project") ?? ((await question(`Project name (${defaultName}): `)) || defaultName);

  // --- one-time per-user key custody setup ---
  let global = loadGlobalConfig();
  if (!global) {
    const hasKeychain = await keychainAvailable();
    let keyProvider: KeyProviderId = hasKeychain ? "keychain" : "passphrase";
    if (boolOpt(p, "passphrase")) keyProvider = "passphrase";
    if (boolOpt(p, "keychain")) {
      if (!hasKeychain) {
        log.error("OS keychain not available on this machine. Use --passphrase instead.");
        return 1;
      }
      keyProvider = "keychain";
    }

    global = { keyProvider, dbPath: DEFAULT_DB_PATH };
    if (keyProvider === "passphrase") {
      global.passphraseSalt = newPassphraseSalt();
      const kp = createKeyProvider(global, {
        promptPassphrase: () => password("Create a NoEnv passphrase: "),
      });
      const cipher = createCipher(kp.keyId, await kp.getMasterKey());
      global.passphraseVerifier = cipher.encrypt(VERIFIER_PLAINTEXT).ciphertext;
    } else {
      // Materialize the keychain master key now so first `set` is seamless.
      await createKeyProvider(global).getMasterKey();
    }
    saveGlobalConfig(global);
    log.success(`Initialized NoEnv key custody: ${keyProvider}.`);
  } else {
    log.info(`Using existing NoEnv key custody: ${global.keyProvider}.`);
  }

  // --- committed, secret-free project config ---
  const existing = loadProjectConfig(cwd);
  if (existing && path.dirname(existing.path) === cwd) {
    log.info(`Project config already present (${path.basename(existing.path)}).`);
  } else {
    const config: NoEnvConfig = {
      project: projectName,
      defaultMode: strOpt(p, "mode") ?? "local",
      providers: [{ name: "local", type: "sqlite", path: global.dbPath ?? DEFAULT_DB_PATH }],
      rules: context.git.remote
        ? { git: [{ remote: context.git.remote, project: projectName }] }
        : {},
      sensitiveModes: ["prod", "production", "staging"],
    };
    const cfgPath = defaultProjectConfigPath(cwd);
    saveProjectConfig(cfgPath, config);
    log.success(`Wrote ${path.basename(cfgPath)} (safe to commit — no secrets).`);
  }

  const added = ensureGitignore(path.join(cwd, ".gitignore"), [
    ".env",
    ".env.*",
    ".noenv/",
    "*.noenv.secret",
  ]);
  if (added.length) log.success(`Updated .gitignore (+${added.length}).`);

  log.info("");
  log.info("Next:");
  log.info("  noenv set DATABASE_URL");
  log.info("  noenv -- npm run dev");
  return 0;
}
