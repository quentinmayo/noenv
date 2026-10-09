<div align="center">
<img src="docs/assets/banner.svg" alt="NoEnv — run commands with secrets, without committing secrets" width="100%" />
</div>

# NoEnv

Run commands with secrets, without keeping a plaintext `.env` in your repository.
NoEnv stores values in encrypted SQLite outside the project, resolves them at
launch, and passes them to the command's environment.

```sh
noenv -- npm run dev
```

**Status: v0.1.0 with local SQLite and a read-only Knox provider in this checkout.**
Import/export, basic schemas, context rules, and diagnostics are implemented.
Team authentication and a NoEnv broker server are planned. See
[Knox setup and live-test results](docs/providers/knox.md).

[Usage](docs/usage.md) · [Configuration](docs/configuration.md) ·
[Security and limitations](docs/security.md) · [Product plan](docs/PRD.md)

## Install from source

Use Node.js 24 for the workflow below. The package declares Node >=22, but uses
[`node:sqlite`](https://nodejs.org/api/sqlite.html), added in Node 22.5 and
available without `--experimental-sqlite` from Node 22.13. Git is needed to clone the repository
and enables optional project/branch detection.

```sh
git clone https://github.com/quentinmayo/noenv.git
cd noenv
npm ci
npm run build
npm link
noenv --version
```

`npm link` exposes the built CLI as `noenv`. Rebuild after changing TypeScript.
To use the checkout without linking, run `node /absolute/path/to/noenv/dist/index.js`.
These instructions do not depend on a published npm release.

## Quickstart

Run these commands from the application directory:

```sh
noenv init --project my-api
noenv set DATABASE_URL          # hidden prompt for the value
noenv set OPENAI_API_KEY
noenv list                     # names and metadata only
noenv -- npm run dev
```

`init` creates `noenv.config.json`, initializes per-user key custody, and adds
ignore rules. The SQLite database is created when a provider is first opened.
The default location is `~/.noenv/noenv.db`. Initialization prefers the optional
OS keychain binding; use `noenv init --passphrase` to explicitly choose a
passphrase on first setup.

To migrate an existing file:

```sh
noenv import .env --mode local
noenv list --mode local
noenv --mode local -- npm run dev
# After checking the application works:
rm .env
```

Import encrypts the values and adds an ignore entry; it does not delete the
source file or remove Git history. If real credentials were committed, rotate
them and remove the exposure from history.

## Commands

| Command | Behavior |
| --- | --- |
| `noenv -- <command> [args...]` | Resolve values and launch a command; `noenv run -- ...` is equivalent |
| `noenv --mode dev -- npm test` | Select a mode explicitly |
| `noenv --dry-run -- npm run dev` | Resolve/decrypt values and display a plan without launching |
| `noenv init` | Initialize project configuration and per-user key custody |
| `noenv set KEY` | Store a value from a hidden prompt |
| `noenv get KEY [--redact]` | Print one value; plaintext by default |
| `noenv list` | List variable names and metadata |
| `noenv remove KEY` | Delete after confirmation; `--yes` skips the prompt |
| `noenv import .env` | Copy dotenv values into the encrypted store |
| `noenv export --format dotenv --redact` | Print masked output; omit `--redact` for real values |
| `noenv export --temporary -- <command>` | Create `.env` in the current directory, run, then attempt deletion |
| `noenv context` | Show detected context and the selected run mode |
| `noenv doctor` | Check initialization, key custody, and encryption |
| `noenv schema init` | Create a basic variable schema |
| `noenv schema validate` | Check required variables and numeric values |
| `noenv schema generate-env` | Print defaults/placeholders, without resolving secrets |
| `noenv schema docs` | Print a Markdown variable table |

See [usage](docs/usage.md) for flags, exports, schema limitations, and CI setup.
`login`, `logout`, and `server` are stubs; `link` is not implemented.

## Modes and configuration

A project and mode identify a set of values. For `run` and `context`, precedence is:

1. `--mode`
2. `NOENV_MODE`
3. First matching enabled branch rule
4. First matching enabled network rule
5. Project `defaultMode`
6. Global `defaultMode`, then `local`

Without a flag or environment override, conflicting branch and network matches
cause `run` to fail. Other secret commands currently use **`--mode`, project
`defaultMode`, then `local`**; pass `--mode` explicitly to keep reads, writes, and
runs aligned.

A portable `noenv.config.json`:

```json
{
  "project": "my-api",
  "defaultMode": "local",
  "providers": [{ "name": "local", "type": "sqlite" }],
  "sensitiveModes": ["prod", "production", "staging"]
}
```

Omitting `path` uses the current user's configured database. `init` currently
writes an absolute path; remove that field before sharing the config across
machines. Paths containing `~` are not expanded. See
[configuration](docs/configuration.md) for provider ordering, rules, and paths.

## Security model

Values use AES-256-GCM with a master key held in the OS keychain or derived with
scrypt from a passphrase. Normal `run` does not create a plaintext secret file.
It filters known bootstrap credentials from the inherited environment and overlays
resolved values; the parent
shell is not modified. Restart the command to pick up changed values.

NoEnv reduces plaintext-file exposure. It does not isolate secrets from the
launched application, its descendants, privileged local inspection, or crash
reporting. `get` and `export` can print plaintext; schema numeric-validation
errors redact values. `sensitiveModes` adds a confirmation
for `run` outside CI; it does **not** prohibit local production secrets or enforce
access policy. Read [security and limitations](docs/security.md) before adoption.

## Knox support

The read-only Knox provider maps each project/mode/environment key to a Knox key
ID and invokes your configured native client with `get -n`. It requires no local
store or keychain for Knox-only projects. Knox retains storage and its deployment's
access controls; NoEnv handles launch-time injection. The adapter was tested
against the existing TLS-enabled LAN deployment, including version promotion and
cleanup of disposable test keys. See [setup and verification](docs/providers/knox.md).

## Development

```sh
npm ci
npm run typecheck
npm test                       # builds, then runs the node:test suite
npm run build
npm run noenv -- --help
```

Source lives in `src/`; compiled output is in `dist/`. SQLite, crypto, and tests
use Node built-ins. `@napi-rs/keyring` is the optional native keychain dependency.

## Roadmap

| Stage | Scope |
| --- | --- |
| Implemented | Local encrypted SQLite, read-only Knox, launch-time injection, modes, import/export, basic schema, context rules, doctor |
| Proposed next | Consistent mode handling, portable generated config, safer shell export |
| Team features | Broker server, remote providers, login/RBAC, central audit and policy |
| Later options | Application-aware file refresh, approvals, web UI, CI/container integrations |

The [PRD](docs/PRD.md) separates current behavior from plans.
[ADR-0001](docs/adr/0001-storage-model-broker-vs-store.md) describes storage;
[ADR-0002](docs/adr/0002-delivery-model-launch-time-vs-daemon.md) describes delivery.
