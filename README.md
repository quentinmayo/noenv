# NoEnv

**Run commands with secrets, without committing secrets.**

NoEnv resolves your environment variables at runtime and injects them only into
the command you run — so you never commit a `.env` file or leave plaintext
secrets sitting in your repo.

```bash
npm install -g @noenv/cli
noenv init
noenv set DATABASE_URL
noenv set OPENAI_API_KEY
noenv -- npm run dev
```

No committed secrets. No plaintext `.env` files. No copying tokens out of Slack.

> **v0.1 — local-first.** This is the MVP slice: a local, encrypted, per-user
> store with runtime injection. Team/server, remote providers, and schema docs
> are on the roadmap (see [`docs/PRD.md`](docs/PRD.md)).

---

## What it does

When you prefix a command with `noenv`, it:

1. builds a **context** (project, mode, git, machine);
2. resolves the env payload for that project + mode from a configured provider;
3. spawns your command with those variables injected into its environment;
4. preserves the child's exit code and streams its stdio.

Secrets live encrypted in a per-user store outside your repo, decrypted only in
memory at launch.

## What it protects (and what it doesn't)

NoEnv is honest about its threat coverage:

| Threat | Covered? |
|---|---|
| Accidental `git commit` of secrets | ✅ yes — nothing secret is in the repo |
| Secrets pasted into chat / shell history | ✅ yes — values are prompted, never on the command line |
| Plaintext `.env` at rest in the repo | ✅ yes — replaced by an encrypted store |
| Laptop theft → secret compromise | ⚠️ partial — local mode ≈ OS-keychain strength |
| Secret readable in a running process | ❌ no — env vars are visible via `/proc`, `ps e`, crash dumps, child processes |
| Live rotation into a running process | ❌ no — rotation applies on the **next run** (env vars are immutable for a process's life) |

> Local mode trades "plaintext in the repo" for "encrypted outside the repo, key
> in the OS keychain." Better — not a secret boundary against a local attacker.

## Key custody

The 32-byte master key is held by one of two providers, chosen at `init`:

- **keychain** (default when available) — the master key lives in the OS keychain
  (macOS Keychain, Windows Credential Manager, libsecret) via a prebuilt native
  module. Seamless, no passphrase prompts.
- **passphrase** (fallback) — the key is derived (scrypt) from a passphrase plus
  a stored salt. Set `NOENV_PASSPHRASE` for non-interactive use, or you'll be
  prompted.

Secrets are encrypted with AES-256-GCM. The key is never written to disk in
plaintext. Each stored row records `enc_key_id` and `enc_alg` so the master key
can be rotated later.

## Commands

```bash
# setup
noenv init                                 # set up NoEnv in this project
noenv doctor                               # diagnose your setup

# run
noenv -- npm run dev                       # resolve + inject, then run
noenv --mode staging -- npm test           # explicit mode
noenv --dry-run -- npm run dev             # show the plan, run nothing

# secrets
noenv set DATABASE_URL [--mode m] [--value v] [--plain]
noenv get DATABASE_URL [--mode m] [--redact]
noenv list [--mode m]                      # keys only, never values
noenv remove DATABASE_URL [--mode m] [--yes]
noenv import .env [--mode m]               # migrate an existing .env

# context
noenv context [detect]                     # show context + resolved mode
noenv context add-network home 192.168.1.0/24 --mode home
noenv context add-git github.com/acme/api --project api

# schema (optional)
noenv schema init | validate | generate-env | docs

# legacy-tool bridge
noenv export [--format dotenv|json|shell] [--redact]
noenv export --temporary -- npm run legacy-dev   # temp .env, run, delete
```

## Modes

A *mode* selects which set of values to load (`local`, `dev`, `staging`, ...).
Resolution is **explicit by default** — auto-selecting secrets from ambient
signals is a footgun. Precedence (first match wins):

1. `--mode` flag
2. `NOENV_MODE` env
3. branch rule *(opt-in, disabled by default)*
4. network/CIDR rule *(opt-in, disabled by default)*
5. project default (`noenv.config.json`)
6. global default (fallback: `local`)

If opt-in branch and network rules disagree and there's no explicit flag, NoEnv
**refuses to guess** and asks you to pass `--mode`.

## Configuration

`noenv.config.json` is committed and contains **no secrets** — just the project
name, default mode, providers, and (opt-in) context rules:

```json
{
  "project": "my-api",
  "defaultMode": "local",
  "providers": [{ "name": "local", "type": "sqlite", "path": "~/.noenv/noenv.db" }],
  "rules": {
    "git": [{ "remote": "github.com/acme/my-api", "project": "my-api" }],
    "network": [{ "name": "home", "cidr": "192.168.1.0/24", "mode": "home", "enabled": false }]
  },
  "sensitiveModes": ["prod", "production", "staging"]
}
```

Running a `sensitiveModes` entry prompts for confirmation (skipped in CI).

## Migrating from `.env`

```bash
noenv import .env          # encrypt into the store + gitignore the file
rm .env                    # delete the plaintext copy
# if .env was ever committed: git rm --cached .env, rotate the secrets,
# and scrub history (e.g. git filter-repo)
```

## Development

```bash
npm install          # installs the prebuilt @napi-rs/keyring (optional)
npm run build        # tsc -> dist/
npm test             # build + node:test suite
npm run typecheck    # tsc --noEmit
```

Near-zero runtime dependencies by design (smaller supply chain): the store uses
the built-in `node:sqlite`, crypto uses `node:crypto`, and the only optional
dependency is the OS-keychain binding. Requires **Node >= 22** (developed on 24).

See [`docs/PRD.md`](docs/PRD.md) and the ADRs in [`docs/adr/`](docs/adr/) for the
design rationale.

## License

MIT
