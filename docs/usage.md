# Using NoEnv v0.1

[README](../README.md) · [Configuration](configuration.md) · [Security](security.md)

## Initialize

```sh
noenv init --project my-api --mode local
```

This writes `noenv.config.json` in the current directory, adds `.env`, `.env.*`,
`.noenv/`, and `*.noenv.secret` to `.gitignore`, and initializes per-user key
custody if it does not exist. An existing config in this directory is preserved.
An existing global key provider is reused: `--passphrase` and `--keychain` do not
migrate an initialized store.

On first setup, `--passphrase` selects scrypt-derived key custody and `--keychain`
requires the optional keychain binding. Without either flag, NoEnv prefers the
binding when it can load it. That availability check does not prove the OS vault
is accessible; use `doctor` to check an encryption round trip.

## Add, inspect, and remove values

```sh
noenv set DATABASE_URL --mode dev
noenv get DATABASE_URL --mode dev --redact
noenv list --mode dev
noenv remove DATABASE_URL --mode dev
```

Values are scoped by project, mode, and key. `set` updates an existing key and
rejects an empty value. `remove` (alias `rm`) prompts unless passed `--yes`.
`get` prints the real value unless `--redact` is set; `list` never prints values.

`set --value=...` accepts a command-line value but may expose it through shell
history and process arguments. Prefer the hidden prompt for real secrets.
`set --plain` only marks metadata as non-secret; the value is still encrypted.

Reads use the first configured provider containing a key. Writes, imports, and
removals use the first writable provider; there is no implemented `--provider`
selection flag. SQLite is writable; the [Knox provider](providers/knox.md) is
read-only. Knox-only projects use an explicit config and do not need `init`.

For these commands, mode selection is `--mode`, project `defaultMode`, then
`local`. They do not use `NOENV_MODE`, branch/network rules, or the global default.
The same limitation applies to `export` and `schema validate`.

## Launch a command

```sh
noenv --mode dev -- npm run dev
noenv run --mode dev -- npm test
noenv --mode dev --dry-run -- npm run dev
noenv --mode dev --verbose -- npm run dev
```

Use `--` to separate NoEnv options from the child command. Arguments after it go
to the child. Normal child exit codes are returned, and stdio is inherited.
NoEnv merges resolved values over the current environment after removing known
bootstrap credentials (see [Knox setup](providers/knox.md#executable-and-credentials)). With no resolved
values it warns and runs with the inherited environment.

`--dry-run` still opens providers, unlocks the store, resolves/decrypts values,
and records a local resolve audit entry. It displays names, not values, and does
not launch the child. `--verbose` reports key/provider mappings to stderr.
The command and its arguments are logged, so avoid embedding secrets in them.

Only `run` and `context` use the full [mode precedence](configuration.md#mode-rules).
For a mode listed in `sensitiveModes`, `run` prompts outside CI. CI detection
checks for a non-empty `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `BUILDKITE`,
`TF_BUILD`, or `JENKINS_URL`, so even `CI=false` is treated as CI. The prompt occurs after resolution;
there is no access-control or production-storage prohibition.

## Import dotenv values

```sh
noenv import .env --mode dev
noenv list --mode dev
noenv --mode dev -- npm run dev
# Delete the source once the imported configuration is verified:
rm .env
```

`import` defaults to `.env` when no path is supplied. Matching keys in the first
writable provider are overwritten. It adds the source basename to `.gitignore`
in the current directory, without deleting the source or changing Git history.
Review ignore coverage when importing from another directory. The parser handles
common dotenv assignments and quoting; it does not execute shell code or expand
variable references.

## Export and legacy applications

```sh
noenv export --mode dev --format dotenv --redact
noenv export --mode dev --format json --redact
noenv export --mode dev --format shell --redact
noenv export --mode dev --temporary -- npm run legacy-dev
```

Ordinary export writes to stdout; `dotenv` is the default format. Without
`--redact` it prints real values. A terminal warning is informational, and piped
output is not automatically protected or gitignored. Shell export currently uses
JSON string quoting, which does not escape shell substitutions such as `$()`;
do not `eval` or source arbitrary exported values.

Temporary export writes a real `.env` in the **current working directory**, adds
an ignore rule, runs the command with the inherited environment, and attempts to
delete the file in a `finally` block. The application must load `.env` itself;
this command does not inject the resolved values into the child's environment.
Temporary mode always writes real dotenv values, even with `--redact` or
`--format json`.

An existing `.env` causes refusal unless `--force` is supplied. With `--force`,
the old file is overwritten and then deleted, not restored. Abrupt termination
can leave the temporary file behind. See [security](security.md).

## Basic variable schemas

Run schema commands from the directory containing `noenv.schema.json` (usually
the project root); unlike project configuration, schema lookup does not walk up
parent directories.

```sh
noenv schema init
noenv schema validate --mode dev
noenv schema generate-env
noenv schema docs
```

The schema is NoEnv's own small format, not a full JSON Schema implementation:

```json
{
  "variables": {
    "DATABASE_URL": {
      "type": "string",
      "required": true,
      "secret": true,
      "description": "Primary database connection string"
    },
    "APP_PORT": {
      "type": "number",
      "required": false,
      "default": 3000
    }
  }
}
```

`validate` checks presence of required provider keys and whether numeric values
convert with JavaScript `Number`. It does not enforce booleans, URLs, patterns,
or non-empty strings, inspect inherited environment variables, or apply defaults.
Numeric failures redact the invalid value.

`generate-env` prints declared defaults or placeholders without fetching values;
keep secrets out of schema defaults and descriptions. `docs` prints a Markdown
table. Neither command automatically writes a file. Schemas are not automatically
validated during `run`, and defaults are not injected.

## Context and diagnostics

```sh
noenv context
noenv context add-git github.com/acme/api --project api
noenv context add-network office 192.168.10.0/24 --mode dev
noenv doctor
```

`add-network` immediately enables the added rule. Set `enabled: false` in the
configuration to disable it. Branch rules are edited in JSON; there is no
`add-branch` command. `context` reports ambiguity but currently exits successfully;
`run` refuses ambiguous selection. Git remote rules select a project namespace,
not permissions.

`doctor` checks the Node major version, Git presence, global/project config,
keychain binding availability, a simple `.env` ignore check, and an encryption
round trip. It reports the global database path; it does not inspect all configured
databases or validate schemas. For Knox-only projects it validates configuration
without requiring local keys; it does not test network access.

## Non-interactive local use

Provide `NOENV_PASSPHRASE` through the CI system's secret environment before
initialization or use of a passphrase-backed store. Do not put it in committed
scripts. For example, with that variable already populated:

```sh
noenv init --project my-api --passphrase --mode dev
noenv --mode dev -- npm test
```

Initialization alone does not populate the store. Supply the intended values
separately; a fresh runner has no existing local secrets. `NOENV_HOME` can select
an isolated directory for global config and the default database. NoEnv removes inherited `NOENV_PASSPHRASE` and the known Knox authentication
variables from launched children. See [security](security.md).
