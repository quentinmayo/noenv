# Security model and known limits

[README](../README.md) · [Usage](usage.md)

## What the local store protects

NoEnv v0.1 reduces the need to keep plaintext `.env` files in a repository.
Values are encrypted with AES-256-GCM, using a fresh 12-byte IV and a 16-byte
authentication tag for each encryption. The 32-byte key is either stored through
`@napi-rs/keyring` in the OS keychain or derived with scrypt from a passphrase and
a stored salt. Normal `run` decrypts in memory and creates no plaintext secret file.

The implementation encrypts values directly with that master key. It does not
yet implement separate wrapped data keys or a master-key rotation command.
`enc_key_id` and `enc_alg` record metadata for future evolution. Project names,
modes, variable names, timestamps, and audit metadata are not encrypted.

Backups need the database and access to the original key custody. Passphrase mode
also needs its original salt/global config. Losing the key or salt can make the
values unrecoverable; reinitialization is not a recovery or migration procedure.

## Boundaries

| Situation | Current behavior |
| --- | --- |
| Accidental plaintext file commit | Normal injection avoids a new file; ignore rules do not untrack existing files or erase history |
| Local database copied | Values are encrypted; protection depends on master-key access or passphrase strength |
| Running application | It and its descendants receive values; OS inspection, dumps, and application logs can expose them |
| Rotation | A new launch resolves new values; existing processes are not updated by NoEnv |
| Production mode | A name and optional confirmation, not enforced access policy |
| Audit | SQLite records set/get/remove/resolve-all actions locally; it is not centralized or tamper-resistant |
| Provider trust | SQLite and a native Knox client handle plaintext and must be trusted |

Applications can modify their own environments. The relevant limit is that an
external wrapper cannot ordinarily refresh the environment of a child that is
already running. Application-aware reload or file delivery would be a separate
integration.

## Plaintext exposure paths

- `get` and ordinary `export` print real values unless `--redact` is requested.
- Shell export uses JSON quoting, which leaves shell substitutions active. Do
  not `eval` or source arbitrary exported values.
- `set --value` and secret child-command arguments can expose values through
  shell history, process inspection, and command logging. Prefer hidden prompts.
- `export --temporary` writes plaintext `.env` in cwd. Cleanup is attempted on
  normal control flow, not guaranteed after a crash or forced kill. `--force`
  destroys the previous file rather than restoring it.
- NoEnv filters inherited `NOENV_PASSPHRASE` and the three known Knox auth
  variables from children. Custom auth variables and credential files remain
  outside this filter; an explicitly resolved variable can also reintroduce a name.
- Dry runs still resolve/decrypt values and audit resolution, even though the
  output only lists keys. They are not metadata-only access checks.

A local attacker able to access the keychain or inspect NoEnv/application memory
may obtain values. Encryption at rest is not a sandbox for launched commands.
The database's filesystem permissions depend on the process defaults; restrict
access to the state directory and its backups.

## Planned protections

Remote-only production policy, RBAC, central audit, and local master-key rotation
are work to implement, not v0.1
guarantees. The [PRD](PRD.md) and
[storage ADR](adr/0001-storage-model-broker-vs-store.md) describe that direction.
The [read-only Knox adapter](providers/knox.md) provides remote resolution using
the deployment's access controls. The tested LAN deployment gives allowed clients
a shared administrator identity; it does not provide per-user/project isolation.
Schema numeric-validation errors now redact values.
