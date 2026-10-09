# NoEnv product requirements and implementation status

**Revision:** 2026-10-09 · **Current package:** v0.1.0

This document separates the implemented local/Knox CLI from proposed team features.
For executable workflows, use the [README](../README.md), [usage guide](usage.md),
and [configuration reference](configuration.md).

## 1. Product

**NoEnv** resolves values at command launch and injects them into the child
process's environment. Its purpose is to reduce plaintext `.env` files and
accidental secret commits while preserving ordinary application configuration.

**Tagline:** Run commands with secrets, without committing secrets.

The package is `@noenv/cli`, the command is `noenv`, and the current source tree
is a single TypeScript package. Installation from source is documented; the
package name alone is not a claim that an npm release has been published.

## 2. Current implementation

| Area | Implemented behavior |
| --- | --- |
| Storage | Encrypted local SQLite or read-only Knox, scoped by project/mode/key |
| Key custody | OS keychain binding or scrypt-derived passphrase key |
| Delivery | Resolve, merge over inherited env, launch child, inherit stdio and normal exit code |
| Secrets | `set`, `get`, `list`, `remove`/`rm`, dotenv import |
| Export | dotenv/JSON/shell stdout; temporary `.env` bridge |
| Context | Git/project detection, explicit modes, opt-in branch and IPv4 network rules |
| Schemas | Required-key/numeric checks, placeholders/default output, Markdown table |
| Diagnostics | `context`, `doctor`, verbose resolution, dry-run launch plans |
| Audit | Local SQLite rows for reads/resolution/writes/removals |

**Not implemented:** Other remote providers, server, login/logout,
RBAC, remote-only production policy, central audit, a dynamic provider plugin
loader, automatic schema checks during launch, or live rotation.
`login`, `logout`, and `server` are recognized stubs; `link` is absent.

## 3. Target users and scope

- Individual developers: encrypted local values, explicit environment selection,
  migration from dotenv, and ordinary command execution.
- Engineering teams: planned shared references, authenticated remote resolution,
  easier onboarding, and centralized access controls.
- Platform/security teams: planned provider integration, scoped CI access,
  central audit, and enforceable deployment policy.

The local MVP does not synchronize secrets across machines. Remote resolution
would remove the need to copy a local database, while still delivering plaintext
values to authorized client processes.

## 4. Principles

1. Keep real values out of committed configuration and schemas.
2. Preserve command-first use: applications read their normal environment.
3. Keep local use possible without server infrastructure.
4. Make source, project, and mode inspectable without printing secret values.
5. Describe implemented protections separately from intended policy.
6. Keep schema checks optional and explicitly invoked.

## 5. Resolution and delivery

```text
context -> project + mode -> provider results -> child environment
```

Project precedence is flag, matching Git rule, project config, Git repository
name, then cwd basename. For `run` and `context`, mode precedence is flag,
`NOENV_MODE`, enabled branch rule, enabled network rule, project default, global
default, then `local`. Conflicting branch/network modes without an explicit
flag/environment override prevent launch.

Other secret commands currently use only flag, project default, then `local`.
Unifying those paths is follow-up work. Network/Git signals are convenience
inputs, not proof of identity or access rights.

`get` queries in provider order. Bulk resolution queries every provider and
merges results with the first provider winning duplicate keys. Writes select
the first writable provider. The actual contract is
[`SecretProvider`](../src/providers/types.ts): `getSecret`, `resolveAll`, `list`,
`set`, `remove`, `close`, plus `name` and `writable`.

SQLite and Knox are constructed today. Knox-only configurations need no local
key custody; other providers still need factory/configuration integration.

Launch-time injection remains the default. External rotation affects the next
launch, not the environment of an already running child. Future file delivery
would require application reload behavior; it cannot automatically update an
application that reads only its startup environment. See
[ADR-0002](adr/0002-delivery-model-launch-time-vs-daemon.md).

## 6. Configuration and schema

Committed `noenv.config.json` contains project, default mode, provider settings,
context rules, and optional `sensitiveModes`. Omit SQLite `path` for a portable
per-user default; the current generator writes an absolute path. `~` is not
expanded. Full fields and precedence are in [configuration](configuration.md).

`noenv.schema.json` is an implemented custom `variables` format, not a complete
JSON Schema validator. Validation currently checks required provider values and
numeric conversion only. Defaults are used by placeholder generation, not by
launch or validation. Schema lookup uses cwd, unlike project config lookup.

Future schema work may include more types, safe diagnostics, and opt-in launch
validation. Avoid promising TypeScript generation or a JSON Schema engine until
implemented.

## 7. Security requirements and gaps

See [security and limitations](security.md) for the complete current boundary.

Implemented encryption uses AES-256-GCM directly with the keychain/passphrase
master key. It stores algorithm/key identifiers but has no wrapped per-record
data key, migration command, or master-key rotation workflow. Local audit rows
and non-value metadata remain plaintext and are not tamper-resistant.

The following tracks requirements, recent fixes, and remaining gaps:

| Requirement | Current gap |
| --- | --- |
| Enforce remote-only production scopes | Local writes accept any mode name |
| Avoid logging resolved values | Numeric schema errors and Knox transport errors now redact values |
| Keep bootstrap credentials out of applications | Known NoEnv/Knox variables are filtered; custom auth variables and files remain outside this filter |
| Consistent explicit mode handling | CRUD/export/schema differ from `run`/`context` |
| Safe shell export | Serializer uses JSON quoting; it is not safe to evaluate arbitrary values as shell source |
| Safe temporary-file lifecycle | Forced termination can leave plaintext; `--force` overwrites then deletes an existing file |
| Least-privilege remote access and audit | No remote provider or policy engine exists yet |

`sensitiveModes` only adds a non-CI confirmation to `run`, after values are
resolved. It does not prevent reads/writes/exports or establish access control.
Dry runs resolve/decrypt values even though their output contains names only.

Runtime environment exposure remains an explicit limit: applications, their
descendants, privileged inspection, and dumps may reveal secrets. Remote storage
does not eliminate this boundary.

## 8. Knox integration

A read-only Pinterest Knox adapter is implemented. It calls a trusted native
client with `get -n`, maps exact project/mode/variable names to key IDs, and injects
current primary values at launch. Knox-only use does not need local key custody.
Unknown scopes and mapped-key failures prevent launch.

Knox remains responsible for storage, access controls, and rotation. This needs
no NoEnv server. The adapter passed live retrieval/injection/rotation/cleanup
checks against the existing TLS-enabled LAN deployment on 2026-10-09. That
service uses shared LAN administrator access, not individual authentication.
See [Knox setup and verification](providers/knox.md) for details and remaining
platform/authentication validation limits.

## 9. Team server direction

[ADR-0001](adr/0001-storage-model-broker-vs-store.md) proposes a broker-first
server: persist references, ACLs, and audit; resolve values from an external
manager. An optional encrypted store may follow for teams without one.

A broker handling plaintext values or credentials remains a sensitive system.
Avoiding persistent value storage reduces duplication; it does not mean the
broker cannot access or leak secrets.

Planned capabilities include user/team/project management, scoped CI identity,
RBAC, central audit, and references to Knox, AWS Secrets Manager/SSM, 1Password,
Vault, and other managers. Provider support is incremental, not implied by this
list. Proposed server stack: Node/TypeScript with Fastify or Hono, a REST API,
and a database suited to the deployment. These are unimplemented choices.

Provider code has access to secrets. A reviewed first-party integration is the
initial direction; signed/distributed plugins and declared permissions need a
separate design before an open plugin ecosystem is offered.

## 10. Roadmap and acceptance

**Local correctness and remote integration follow-up:** consistent mode handling,
portable generated paths, safer export handling, and testing additional Knox
platform/authentication configurations.

**Team release:** authenticated broker, login/link, RBAC, enforceable remote-only
production policy, central audit, and additional tested providers.

**Later options:** web UI, version history, approvals, CI/container integration,
completions, application-aware file refresh, policy as code, hosted service,
SSO/SAML/SCIM, MFA, dynamic credentials, and a Kubernetes agent.

Each capability needs configuration documentation, error behavior, tests, and a
clear security boundary before moving to the implemented list. A file-refresh
agent must not be marketed as live environment-variable rotation.

Success measures remain installation-to-first-run time, verified migrations
away from plaintext files, successful scoped launches, and (when implemented)
remote onboarding, audit coverage, and access-policy enforcement.

## 11. Repository structure

```text
src/
  cli/          commands/       config/       context/
  core/         crypto/         modes/        providers/       util/
  index.ts      types.ts
docs/
  assets/       adr/            providers/
  PRD.md        usage.md        configuration.md             security.md
```

`scripts/test-knox-live.mjs` exercises a configured Knox deployment using a
disposable fixture. Tests live beside their modules as `*.test.ts`. `npm test` builds the package
and runs Node's test runner in `dist/`; `npm run typecheck` checks types without
emitting. There is no current monorepo, server app, or web app.
