import crypto from "node:crypto";

export const ENC_ALG = "aes-256-gcm";

export interface Encrypted {
  alg: string;
  /** base64 of iv(12) | authTag(16) | ciphertext */
  ciphertext: string;
}

export interface Cipher {
  /** Identifier of the key used, stored alongside ciphertext for future rotation. */
  keyId: string;
  encrypt(plaintext: string): Encrypted;
  decrypt(enc: Encrypted): string;
}

/**
 * AES-256-GCM authenticated encryption. The 12-byte IV and 16-byte auth tag are
 * prepended to the ciphertext so a single base64 string is fully self-describing.
 */
export function createCipher(keyId: string, masterKey: Buffer): Cipher {
  if (masterKey.length !== 32) {
    throw new Error(`master key must be 32 bytes, got ${masterKey.length}`);
  }
  return {
    keyId,
    encrypt(plaintext: string): Encrypted {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv(ENC_ALG, masterKey, iv);
      const data = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
      const tag = c.getAuthTag();
      return { alg: ENC_ALG, ciphertext: Buffer.concat([iv, tag, data]).toString("base64") };
    },
    decrypt({ alg, ciphertext }: Encrypted): string {
      if (alg !== ENC_ALG) throw new Error(`unsupported encryption alg: ${alg}`);
      const buf = Buffer.from(ciphertext, "base64");
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const data = buf.subarray(28);
      const d = crypto.createDecipheriv(ENC_ALG, masterKey, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString("utf8");
    },
  };
}
