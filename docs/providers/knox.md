# Pinterest Knox provider

**Status: implemented in this checkout; live-tested on 2026-10-09.** The
read-only adapter uses an installed, deployment-configured Knox CLI. It fetches
values at launch with `knox get -n`, without copying them to NoEnv's SQLite store.

[README](../../README.md) · [Configuration](../configuration.md) ·
[Security](../security.md)

## Setup

Install and configure a trusted native Knox client for your deployment first.
The client handles endpoint configuration, certificate verification, and the
deployment's authentication mechanism. NoEnv does not install Knox or change its
server configuration. Do not use the upstream development client unchanged in
production; its example TLS settings are not production defaults.

Build this NoEnv checkout with `npm ci && npm run build` and use the linked
`noenv` command, or `node /absolute/path/to/noenv/dist/index.js`.
Create `noenv.config.json` in your application directory:

```json
{
  "project": "my-api",
  "defaultMode": "dev",
  "providers": [
    {
      "name": "team-knox",
      "type": "knox",
      "command": "knox",
      "timeoutMs": 10000,
      "projects": {
        "my-api": {
          "dev": {
            "DATABASE_URL": "my_api:dev:database_url"
          },
          "staging": {
            "DATABASE_URL": "my_api:staging:database_url"
          }
        }
      }
    }
  ],
  "sensitiveModes": ["staging", "prod", "production"]
}
```

Replace the example IDs with existing keys accessible to your client. The config
contains references, not values. Each project/mode needs at least one mapping;
unknown projects or modes fail instead of launching with inherited credentials.
Knox IDs may contain letters, digits, underscores, and colons. Environment names
must match `[A-Za-z_][A-Za-z0-9_]*`.

A Knox-only configuration works without `noenv init`, a global NoEnv config,
passphrase, keychain access, or a local database. `init` remains the local-store
setup command; use the configuration above for remote-only setup.

```sh
noenv list --mode dev
noenv doctor
noenv get DATABASE_URL --mode dev --redact
noenv --mode dev --dry-run -- npm run dev
noenv --mode dev -- npm run dev
```

Use explicit `--mode` across commands: CRUD/export/schema still use a simpler
mode selector than `run`/`context`. See [configuration](../configuration.md#mode-rules).

## Executable and credentials

`command` defaults to `knox` on PATH. Use an absolute executable path when
preferred, or set `NOENV_KNOX_COMMAND` as a per-user override for all Knox
providers. It is one executable, not a shell command with flags. The adapter
passes `get`, `-n`, and the key ID as separate arguments with no shell.
Treat executable configuration as trusted project code.

Knox receives the parent environment and reads its usual configuration. NoEnv
removes inherited `NOENV_PASSPHRASE`, `KNOX_USER_AUTH`, `KNOX_MACHINE_AUTH`, and
`KNOX_SERVICE_AUTH` from launched applications, including temporary-export
children. Explicitly resolved variables can still use those names. Custom auth
variable names and credential files are outside this filter; applications running
as the same OS user may still access them. This is not process isolation.

## Read semantics

| Operation | Behavior |
| --- | --- |
| `get` | Fetch the primary value for the exact mapping; unmapped variable names can continue to a later provider |
| `run`, export, schema validation | Fetch every mapped value in the selected scope, sequentially |
| `list` | Show configured names without contacting Knox; not a live-access check |
| `doctor` | Validate remote-only provider configuration; not a network or authentication check |
| `set`, `remove`, import | Knox is read-only; these fail with no writable provider in a Knox-only project |
| Mixed provider chain | Existing first-provider read precedence and first-writable-provider write behavior apply |

Mapped-key failures abort the operation. A missing remote key, access denial,
client failure, timeout, or oversized output does not fall back to a local value.
Unknown/empty scopes are rejected. Raw client stdout/stderr is never included
in error messages. Diagnose the trusted Knox client separately without sharing
its secret output.

The adapter preserves UTF-8 text, spaces, and trailing newlines; empty returned
values are permitted. NUL bytes and invalid UTF-8 are rejected. Each read has a
1 MiB output limit and a default 10-second timeout; `timeoutMs` accepts an integer
from 1 through 120000. Provider shutdown cancels outstanding reads.

`-n` forces a network read rather than the Knox file cache, and the default get
selects the primary version. See [the upstream get implementation](https://github.com/pinterest/knox/blob/master/client/get.go).
A version promoted in Knox is observed on the next NoEnv launch. NoEnv does not
refresh already running applications. Version pinning, binary-file delivery,
and a direct HTTPS transport are not implemented.

`--dry-run` still fetches the real values but only displays names. `get` and
ordinary export print plaintext unless `--redact` is supplied. Temporary export
intentionally writes `.env`; see [usage](../usage.md#export-and-legacy-applications).

## Verified local deployment

The live test used the existing macOS ARM64 native client and the LAN Knox
service, with the client's configured CA and TLS verification. That deployment
uses a shared LAN administrator identity and requires no login. It provides no
per-user or per-project authorization; NoEnv mappings do not add such isolation.
Individual OAuth/mTLS client deployments and native Windows execution were not
validated by this test.

The test created a unique `noenv:integration:<random-id>` fixture, verified
retrieval and injection, added/promoted a version, and confirmed the next launch
received the new value. It also checked exit codes, dry-run behavior, list/export,
read-only writes, missing-key and unknown-scope rejection, and absence of a local
NoEnv store or plaintext file. Cleanup deleted the fixture and confirmed that
subsequent reads failed. Existing secret values were not read or modified.

The first test attempts exposed an extra `Reading from stdin...` line in the
Knox `add` response; the harness now extracts the version from its labeled output
and preserves the version ID as a string. Those attempts also cleaned up their
fixtures.

## Repeat the tests

```sh
npm test
npm run typecheck
# Explicit live test: creates, rotates, and deletes only its unique fixture.
node scripts/test-knox-live.mjs
```

The live script requires a built checkout and create/write/delete access in the
configured Knox deployment. It captures values in memory and reports pass/fail
without printing them. It does not enumerate or modify existing keys. A cleanup
failure reports the unique fixture ID for manual follow-up.

Automated tests additionally cover invalid mappings, byte validation, bounded
output/timeouts, canceled reads, missing executables, redacted failures, credential
filtering, and schema error redaction. Native-client fixture tests currently run
on POSIX; they are skipped on Windows.
