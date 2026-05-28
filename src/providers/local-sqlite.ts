import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SecretMetadata, SecretValue } from "../types.js";
import type {
  RemoveInput,
  ResolveOneInput,
  ScopeInput,
  SecretProvider,
  SetInput,
} from "./types.js";
import type { Cipher } from "../crypto/envelope.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  mode TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  enc_key_id TEXT NOT NULL,
  enc_alg TEXT NOT NULL,
  secret INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project, mode, key)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  project TEXT,
  action TEXT NOT NULL,
  key TEXT,
  mode TEXT,
  context_json TEXT,
  created_at TEXT NOT NULL
);
`;

interface SecretRow {
  key: string;
  value_encrypted: string;
  enc_alg: string;
  enc_key_id: string;
  secret: number;
  updated_at: string;
}

function now(): string {
  return new Date().toISOString();
}

export class LocalSqliteProvider implements SecretProvider {
  readonly writable = true;
  private readonly db: DatabaseSync;

  constructor(
    readonly name: string,
    dbPath: string,
    private readonly cipher: Cipher,
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA);
  }

  private audit(action: string, project: string, mode: string, key?: string): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (id, project, action, key, mode, context_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), project, action, key ?? null, mode, null, now());
  }

  async getSecret(input: ResolveOneInput): Promise<SecretValue | null> {
    const row = this.db
      .prepare(
        `SELECT key, value_encrypted, enc_alg, enc_key_id, secret, updated_at
         FROM secrets WHERE project = ? AND mode = ? AND key = ?`,
      )
      .get(input.project, input.mode, input.key) as unknown as SecretRow | undefined;
    if (!row) return null;
    this.audit("get", input.project, input.mode, input.key);
    return {
      key: row.key,
      value: this.cipher.decrypt({ alg: row.enc_alg, ciphertext: row.value_encrypted }),
      provider: this.name,
      secret: row.secret === 1,
    };
  }

  async resolveAll(input: ScopeInput): Promise<SecretValue[]> {
    const rows = this.db
      .prepare(
        `SELECT key, value_encrypted, enc_alg, enc_key_id, secret, updated_at
         FROM secrets WHERE project = ? AND mode = ? ORDER BY key`,
      )
      .all(input.project, input.mode) as unknown as SecretRow[];
    this.audit("resolve-all", input.project, input.mode);
    return rows.map((row) => ({
      key: row.key,
      value: this.cipher.decrypt({ alg: row.enc_alg, ciphertext: row.value_encrypted }),
      provider: this.name,
      secret: row.secret === 1,
    }));
  }

  async list(input: ScopeInput): Promise<SecretMetadata[]> {
    const rows = this.db
      .prepare(
        `SELECT key, secret, updated_at FROM secrets
         WHERE project = ? AND mode = ? ORDER BY key`,
      )
      .all(input.project, input.mode) as unknown as Array<
      Pick<SecretRow, "key" | "secret" | "updated_at">
    >;
    return rows.map((row) => ({
      key: row.key,
      mode: input.mode,
      secret: row.secret === 1,
      provider: this.name,
      updatedAt: row.updated_at,
    }));
  }

  async set(input: SetInput): Promise<void> {
    const enc = this.cipher.encrypt(input.value);
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO secrets
           (id, project, mode, key, value_encrypted, enc_key_id, enc_alg, secret, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project, mode, key) DO UPDATE SET
           value_encrypted = excluded.value_encrypted,
           enc_key_id = excluded.enc_key_id,
           enc_alg = excluded.enc_alg,
           secret = excluded.secret,
           updated_at = excluded.updated_at`,
      )
      .run(
        crypto.randomUUID(),
        input.project,
        input.mode,
        input.key,
        enc.ciphertext,
        this.cipher.keyId,
        enc.alg,
        input.secret === false ? 0 : 1,
        ts,
        ts,
      );
    this.audit("set", input.project, input.mode, input.key);
  }

  async remove(input: RemoveInput): Promise<boolean> {
    const result = this.db
      .prepare(`DELETE FROM secrets WHERE project = ? AND mode = ? AND key = ?`)
      .run(input.project, input.mode, input.key);
    if (result.changes > 0) this.audit("remove", input.project, input.mode, input.key);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
