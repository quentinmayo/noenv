import crypto from "node:crypto";
import type { GlobalConfig, KeyProviderId } from "../types.js";

const KEYCHAIN_SERVICE = "noenv";
const KEYCHAIN_ACCOUNT = "master-key";

/**
 * Custody of the 32-byte master key. Two implementations:
 *  - keychain:   master key lives in the OS keychain (default when available).
 *  - passphrase: master key is derived (scrypt) from a passphrase + stored salt.
 *
 * Either way the key is never written to disk in plaintext.
 */
export interface KeyProvider {
  id: KeyProviderId;
  /** Recorded in each ciphertext row's enc_key_id, for future key rotation. */
  keyId: string;
  getMasterKey(): Promise<Buffer>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadKeyring(): Promise<any | null> {
  try {
    return await import("@napi-rs/keyring");
  } catch {
    return null;
  }
}

export async function keychainAvailable(): Promise<boolean> {
  const mod = await loadKeyring();
  return Boolean(mod?.Entry);
}

class KeychainKeyProvider implements KeyProvider {
  readonly id: KeyProviderId = "keychain";
  readonly keyId = `keychain:${KEYCHAIN_SERVICE}/${KEYCHAIN_ACCOUNT}`;
  private cached?: Buffer;

  async getMasterKey(): Promise<Buffer> {
    if (this.cached) return this.cached;
    const mod = await loadKeyring();
    if (!mod?.Entry) {
      throw new Error(
        "OS keychain unavailable (@napi-rs/keyring not installed). Re-run `noenv init` to use passphrase mode.",
      );
    }
    const entry = new mod.Entry(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    let stored: string | null = null;
    try {
      stored = entry.getPassword();
    } catch {
      stored = null;
    }
    if (!stored) {
      const key = crypto.randomBytes(32);
      entry.setPassword(key.toString("base64"));
      this.cached = key;
      return key;
    }
    this.cached = Buffer.from(stored, "base64");
    return this.cached;
  }
}

class PassphraseKeyProvider implements KeyProvider {
  readonly id: KeyProviderId = "passphrase";
  readonly keyId = "passphrase:v1";
  private cached?: Buffer;

  constructor(
    private readonly salt: Buffer,
    private readonly getPassphrase: () => Promise<string>,
  ) {}

  async getMasterKey(): Promise<Buffer> {
    if (this.cached) return this.cached;
    const pass = process.env.NOENV_PASSPHRASE ?? (await this.getPassphrase());
    if (!pass) {
      throw new Error("passphrase required (set NOENV_PASSPHRASE or enter when prompted)");
    }
    const key = crypto.scryptSync(pass, this.salt, 32);
    this.cached = key;
    return key;
  }
}

export interface KeyProviderOpts {
  /** Used by passphrase mode when NOENV_PASSPHRASE is not set. */
  promptPassphrase?: () => Promise<string>;
}

export function createKeyProvider(global: GlobalConfig, opts: KeyProviderOpts = {}): KeyProvider {
  if (global.keyProvider === "keychain") return new KeychainKeyProvider();

  const salt = Buffer.from(global.passphraseSalt ?? "", "base64");
  if (salt.length === 0) {
    throw new Error("passphrase salt missing from global config; run `noenv init`");
  }
  const prompt =
    opts.promptPassphrase ??
    (async () => {
      throw new Error("no passphrase prompt available in this context");
    });
  return new PassphraseKeyProvider(salt, prompt);
}

/** Generate a fresh salt (base64) for passphrase mode at init time. */
export function newPassphraseSalt(): string {
  return crypto.randomBytes(16).toString("base64");
}
