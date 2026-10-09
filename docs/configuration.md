# Configuration reference

[README](../README.md) · [Usage](usage.md)

## Files and paths

| Location | Purpose |
| --- | --- |
| `noenv.config.json` | Project name, modes, providers, context rules; found by walking up from cwd |
| `noenv.schema.json` | Optional schema; read only from cwd |
| `~/.noenv/config.json` | Per-user key provider, passphrase salt/verifier, optional mode and database path |
| `~/.noenv/noenv.db` | Default encrypted SQLite values and local audit metadata |
| OS keychain | Master key when keychain custody is selected |

`NOENV_HOME` overrides `~/.noenv` for global config and the default database. It
does not override an explicit provider `path` or existing global `dbPath`.
Global config is created with mode `0600`; the SQLite database and its directory
currently use the process's filesystem defaults. Protect the whole state directory.

Provider paths are passed directly to SQLite: `~` and environment variables are
not expanded, and relative paths resolve from the invocation directory, not the
project config directory. Omit `path` for a portable user-local default.

## Project config

```json
{
  "project": "my-api",
  "defaultMode": "local",
  "providers": [
    { "name": "local", "type": "sqlite" }
  ],
  "rules": {
    "git": [
      { "remote": "github.com/acme/my-api", "project": "my-api" }
    ],
    "branch": [
      { "pattern": "release/*", "mode": "staging", "enabled": false }
    ],
    "network": [
      { "name": "office", "cidr": "192.168.10.0/24", "mode": "dev", "enabled": false }
    ]
  },
  "sensitiveModes": ["prod", "production", "staging"]
}
```

`init` currently includes the creator's absolute database path. Remove `path`
when committing a configuration intended for multiple machines. Configuration
contains no required secret values; do not add credentials to it.

## Provider chain

`type: "sqlite"` and read-only `type: "knox"` are implemented. The fields below
describe SQLite; see [Knox configuration](providers/knox.md) for remote mappings. Each provider has a display `name` and an
optional database `path`, which falls back to global `dbPath`, then the default.
All local providers use the same configured per-user master key.

For `get`, providers are queried in order until one returns a value. For `run`,
`export`, and `schema validate`, every provider resolves the selected scope and
results are merged with the first provider winning duplicate keys. An error from
any queried provider aborts the operation. `list` merges metadata in order.
`set`, `remove`, and `import` use the first writable provider.

This is an internal interface, not a dynamic plugin loader. Adding a remote
provider also requires configuration and construction changes. See the
[Knox provider](providers/knox.md).

## Project selection

For secret operations, project precedence is:

1. `--project`
2. First Git remote rule matching the normalized remote
3. Project config `project`
4. Repository name inferred from the Git remote
5. Current directory basename

Remote rules use normalized values such as `github.com/acme/api`, without a
scheme or trailing `.git`. This chooses a namespace; it is not an authorization
check. A config with a `project` value can still be overridden by a matching Git
rule or explicit flag.

## Mode rules

`run` and `context` use this order:

1. `--mode`
2. Non-empty `NOENV_MODE`
3. First matching enabled branch rule
4. First matching enabled IPv4 CIDR rule
5. Project `defaultMode`
6. Global `defaultMode`
7. `local`

Branch patterns support `*`; they are not full shell globs. Branch and network
rules only participate when `enabled` is truthy. With no explicit flag or
environment override, differing branch/network modes are ambiguous: `run` fails
and asks for an explicit mode. Network detection uses a local interface address,
not an authenticated network identity.

`context add-network` creates an **enabled** rule. Editing JSON with
`enabled: false` keeps a rule available without using it for selection.

`set`, `get`, `list`, `remove`, `import`, `export`, and `schema validate` instead
use `--mode`, project `defaultMode`, then `local`. Until mode handling is unified,
use explicit flags for workflows involving those commands.

`sensitiveModes` only triggers confirmation in non-CI `run`. It does not gate
writes, reads, exports, schema validation, or dry runs. No local-production ban
or remote-only enforcement exists in v0.1.

## Environment variables

| Variable | Current behavior |
| --- | --- |
| `NOENV_HOME` | Select global state directory; resolved relative to cwd if needed |
| `NOENV_PASSPHRASE` | Supply passphrase for scrypt key derivation without prompting |
| `NOENV_KNOX_COMMAND` | Override the executable for all Knox providers (one name/path, no shell arguments) |
| `NOENV_MODE` | Override mode for `run` and `context` only |
| `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `BUILDKITE`, `TF_BUILD`, `JENKINS_URL` | Any non-empty value marks CI and skips the sensitive-run confirmation |

NoEnv strips inherited `NOENV_PASSPHRASE`, `KNOX_USER_AUTH`, `KNOX_MACHINE_AUTH`,
and `KNOX_SERVICE_AUTH` from application environments. Resolved variables overlay
the filtered environment, so explicitly configured variables can still use those
names. Knox itself receives the parent environment for authentication. A Knox-only
project needs no global NoEnv configuration or local key custody.
