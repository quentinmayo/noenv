# Product Requirements Document: NoEnv

> **Status:** Draft v0.2 (revised) · **Owner:** Quentin Mayo · **Last updated:** 2026-05-27
>
> This revision incorporates a design critique of the v0.1 draft. The headline
> changes: an honest security framing of what local mode does and does not
> protect, a launch-time resolution model (not live rotation), explicit `--mode`
> as the default resolution mechanism, a broker-first server, and a deliberately
> small MVP behind a flexible, option-rich architecture. Two load-bearing
> decisions are recorded as ADRs:
>
> - [ADR-0001 — Storage model: broker vs. store](./adr/0001-storage-model-broker-vs-store.md)
> - [ADR-0002 — Delivery model: launch-time vs. daemon](./adr/0002-delivery-model-launch-time-vs-daemon.md)

---

## 1. Product

**NoEnv** — a developer tool that resolves and injects environment variables at
command runtime so developers never have to commit `.env` files or keep
plaintext secret files in their repos.

**Tagline:** *Run commands with secrets, without committing secrets.*

**Brand / packaging**

- Product name: **NoEnv**
- CLI binary: `noenv`
- npm package: `@noenv/cli`
- No public codename. ("Snow" is generic, unsearchable, and squat-prone — drop it.)

---

## 2. Executive Summary

```bash
noenv -- npm run dev
noenv --mode staging -- npm run test:e2e
noenv -- docker compose up
```

When a developer prefixes a command with `noenv`, the tool builds a **context**
(project, mode, git, machine), resolves the right environment payload from a
configured **provider**, and spawns the target command with those variables in
its child environment. The values are never written to the repo and, by default,
never written to disk.

NoEnv is **provider-pluggable**: a local encrypted SQLite store for solo use, a
NoEnv broker server for teams, or external managers (AWS Secrets Manager, SSM,
1Password, Bitwarden, Vault, Doppler, Infisical, GCP/Azure, Knox-compatible).
Schemas are an **optional** power feature for documentation and validation — not
the foundation.

---

## 3. What NoEnv actually protects (read this first)

NoEnv is precise about its threat coverage. Overstating it is how security tools
lose trust.

| Threat | Covered? | Notes |
|---|---|---|
| Accidental `git commit` of secrets | ✅ Yes | Nothing secret lives in the repo. This is the core win. |
| Secrets pasted into Slack / chat | ✅ Yes (workflow) | `import` + provider resolution removes the reason to copy values around. |
| Secrets in shell history | ✅ Yes | `noenv set` prompts; values never appear on the command line by default. |
| Plaintext `.env` at rest in the repo | ✅ Yes | Replaced by an encrypted store outside the repo, or by a remote provider. |
| Laptop theft → secret compromise | ⚠️ Partial | Local mode ≈ OS-keychain strength. **Prod secrets are never stored locally.** |
| Secret readable in a running process | ❌ No | Env vars are visible via `/proc/<pid>/environ`, `ps e`, crash dumps, error reporters, and inherited by child processes. |
| Live rotation into a running process | ❌ No (by design) | Env vars are immutable for a process's life. Rotation applies on the **next run**. See ADR-0002. |

**Honest one-liner for the README:** *local mode trades "plaintext in the repo"
for "encrypted outside the repo, key in the OS keychain." Better — not a secret
boundary against a local attacker.*

---

## 4. Problem Statement

Teams run apps locally, in CI, and across environments using a sprawl of
`.env`, `.env.local`, `.env.dev`, `.env.production`, `.env.example` files. This
is convenient but causes:

1. **Accidental commits** of API keys, DB passwords, tokens, cloud creds.
2. **`.env.example` drift** — example files go stale and mislead.
3. **Manual onboarding** — new engineers beg teammates for values via Slack.
4. **Hard-to-reason-about environments** — local/dev/staging/prod/preview/CI all differ slightly.
5. **Plaintext sprawl across machines** — laptops, old projects, screenshots, backups.
6. **Point solutions** — managers store, schema tools validate, runtime tools inject; nothing connects the workflow.

> **Scope honesty:** problems 1–4 are solved by the MVP. Problem 5
> (cross-machine duplication) is **only** solved by the server / remote-provider
> path (V1), because a per-laptop encrypted store does not sync. The MVP does not
> claim to fix #5.

---

## 5. Product Principles

1. **No committed secrets.** Secrets never need to live in source control.
2. **Command-first.** Wrap a command; never change app code.
3. **Local-first, server-optional.** Solo devs get value with zero infrastructure.
4. **Opinionated defaults, flexible options.** Safe defaults out of the box;
   every meaningful choice (provider, resolution strategy, storage model) is
   configurable. NoEnv supports many ways to work without forcing one.
5. **Verbose and inspectable.** The tool can always explain *what it resolved,
   from which provider, under which mode, and why* — via `--dry-run`,
   `--verbose`, and `noenv context`. No silent magic.
6. **Honest security.** Document exactly what is and isn't protected (§3).
7. **Schemas help, never gate.** Validation/docs are optional power features.

---

## 6. Resolution model (the core mechanic)

NoEnv resolves a payload in four stages. Every stage is observable with
`--dry-run`.

```
context  ──▶  mode  ──▶  provider chain  ──▶  child process env
 (who/where)  (which set)  (where values live)   (spawn, preserve exit code)
```

### 6.1 Mode resolution — explicit by default

Auto-selecting *which secrets to load* from ambient signals (WiFi, branch) is a
footgun: guess wrong and you load prod creds into a dev command. So:

- **MVP:** mode comes from `--mode` (or `NOENV_MODE`), else the project default.
  That's it.
- **Opt-in (V1):** branch rules and network/CIDR rules, **off by default**, and
  when on they **always print the resolved mode** and **require confirmation for
  any mode tagged `sensitive`**.

Documented precedence (first match wins), shown by `noenv context`:

1. `--mode` flag
2. `NOENV_MODE` env override
3. branch rule *(opt-in)*
4. network/CIDR rule *(opt-in)*
5. project default
6. global default

When two opt-in rules match different modes, NoEnv refuses to guess: it prints
both matches and exits non-zero unless `--mode` disambiguates.

### 6.2 Provider chain — pluggable, ordered, observable

Providers are tried in configured order; first hit wins. A resolution log
(redacted) records key → provider for every variable. Built-ins ship first;
external/third-party providers are gated (see §10 security).

```ts
interface SecretProvider {
  name: string;
  getSecret(input: {
    project: string; key: string; mode?: string; context: NoEnvContext;
  }): Promise<SecretValue | null>;
  listSecrets?(input: {
    project: string; mode?: string; context: NoEnvContext;
  }): Promise<SecretMetadata[]>;
}
```

### 6.3 Delivery — launch-time injection

NoEnv resolves at spawn, injects into the child's environment, preserves exit
code, and streams stdio. It does **not** run a daemon and does **not** push
rotations into live processes (ADR-0002). Rotation = "next run gets the new
value." A daemon/file-watch mode is a documented future option, not v1.

---

## 7. Context object

Built before resolution; printable via `noenv context`.

```json
{
  "cwd": "/Users/quentin/projects/my-api",
  "hostname": "quentin-macbook",
  "username": "quentin",
  "git": { "remote": "github.com/quentinmayo/my-api", "branch": "main", "sha": "abc123" },
  "network": { "ip": "192.168.1.25", "cidrMatch": "home" },
  "mode": "local",
  "ci": false
}
```

Inputs: cwd, git remote/branch/root, hostname, username, IP, CIDR profile,
explicit mode, CI metadata, pre-existing env. Network/git fields are *collected*
in MVP for display but only *drive resolution* when opt-in rules are enabled.

---

## 8. Target Users

- **Individual developer** — local, low-ceremony, encrypted store, `.env` import, temp-export bridge for legacy tools.
- **Engineering team** — shared definitions, team backend (broker), RBAC, audit, repo-aware resolution, fast onboarding.
- **Security engineer** — no committed plaintext, access logs, git-aware policy, no prod secrets on laptops, plays nice with secret scanners.
- **Platform engineer** — CLI automation, CI tokens, plugin system, multi-environment, works with existing tools.

---

## 9. Configuration & Schema

### 9.1 `noenv.config.json` (committed, no secrets)

Safe to commit — references and rules only, never values.

```json
{
  "project": "my-api",
  "defaultMode": "local",
  "providers": [
    { "name": "local", "type": "sqlite", "path": "~/.noenv/noenv.db" }
  ],
  "rules": {
    "git": [{ "remote": "github.com/quentinmayo/my-api", "project": "my-api" }],
    "network": [
      { "name": "home", "cidr": "192.168.1.0/24", "mode": "home", "enabled": false }
    ]
  }
}
```

### 9.2 Committed secret *references* (not ciphertext)

NoEnv may commit pointers — `provider + path + version` — never encrypted secret
bytes. References are safe and power team onboarding ("link the repo, resolve
from the broker").

### 9.3 Optional schema (`noenv.schema.json`, post-MVP)

JSON Schema-compatible. Documents required/optional vars, marks secrets,
validates resolved values, generates placeholder `.env` and docs. TypeScript-type
and rich-docs generation are explicitly *not* an early investment — that overlaps
Varlock's lane.

```json
{
  "variables": {
    "DATABASE_URL": { "type": "string", "required": true, "secret": true, "description": "Primary DB connection string" },
    "APP_PORT":     { "type": "number", "required": false, "default": 3000 }
  }
}
```

---

## 10. Security Requirements

### 10.1 Secrets at rest (local)

- Values are **envelope-encrypted**; the data key is wrapped by a master key held
  in the **OS keychain** (macOS Keychain, Windows Credential Manager, libsecret),
  with a passphrase-derived fallback. This replaces the v0.1 "encryption
  placeholder" — it is a launch blocker, not a later task.
- Every encrypted row stores envelope metadata (`enc_key_id`, `enc_alg`) so the
  master key can rotate and schemes can evolve.
- **Prod secrets are never stored in the local provider.** Prod is always
  brokered from a remote provider with audit (ADR-0001). Laptop theft must not
  equal prod compromise.

### 10.2 Secrets at runtime — what we can't fix

Document plainly (§3): once injected, env vars are visible to the process, its
children, `/proc`, `ps e`, crash dumps, and error reporters. NoEnv reduces
file/commit exposure, not runtime exposure.

### 10.3 Logging & redaction

Never log values, full connection strings, tokens, auth headers, passwords, or
private keys. May log: key names, project, mode, provider, redacted markers,
timestamps.

```text
Resolved DATABASE_URL from local-sqlite [redacted]
Resolved OPENAI_API_KEY from 1password   [redacted]
Running: npm run dev
```

### 10.4 Plugin trust

"Plugin-friendly" and "secure by design" are in tension: any provider reads every
secret and makes network calls — an exfiltration vector by design. v1 policy:
**first-party / signed providers only**, with a declared-permissions model on the
roadmap before opening third-party plugins. Don't market open plugins until this
ships.

### 10.5 Safe defaults

Redacted output; no plaintext export without an explicit flag + auto-gitignore +
auto-cleanup; local-only secrets unless configured; no prod mode without explicit
opt-in; confirmation prompts for sensitive modes; `--dry-run` everywhere.

### 10.6 Threat model

Accidental commits · shell-history leaks · log leaks · chat-copy leaks · temp-file
leaks · wrong-project loads · prod-on-unsafe-machine · malicious plugin exfil ·
compromised local store · over-broad CI tokens.

---

## 11. Core User Flows

### 11.1 First-time local setup
```bash
npm install -g @noenv/cli
noenv init                      # pick provider (Local SQLite default)
```
Creates `.noenv/config.json` + `~/.noenv/noenv.db`; appends `.noenv/`,
`*.noenv.secret`, `.env*` to `.gitignore`.

### 11.2 Migrate an existing `.env` (highest-leverage onboarding)
```bash
noenv import .env --mode local  # encrypt into store, gitignore, print git-rm + history-scrub guidance
rm .env
noenv -- npm run dev
```

### 11.3 Add a secret (no value on the command line)
```bash
noenv set DATABASE_URL                          # prompts, masked
noenv set OPENAI_API_KEY --mode local           # value still prompted
```

### 11.4 Run a command
```bash
noenv -- npm run dev
noenv --mode staging -- npm run test:e2e
noenv --dry-run --mode staging -- npm run test:e2e   # show plan, run nothing
```

### 11.5 Inspect resolution
```bash
noenv context           # context + resolved mode + precedence winner
noenv list --mode local # keys only, redacted
```

### 11.6 Legacy tools that demand a real file
```bash
noenv export --temporary -- npm run legacy-dev   # temp .env, run, auto-delete
noenv export --format dotenv --redact            # safe-to-share placeholder
```

### 11.7 Team
```bash
noenv login https://noenv.company.com
noenv link github.com/company/api
noenv --mode dev -- npm run dev                  # resolved from broker, audited
```

---

## 12. CLI Surface

```bash
# lifecycle
noenv init | doctor | login | logout
# run
noenv -- <cmd>            # primary
noenv run -- <cmd>        # explicit alias
noenv [--mode M] [--project P] [--dry-run] [--verbose] -- <cmd>
# secrets
noenv set KEY | get KEY --redact | list | remove KEY | import .env
# context
noenv context [detect] | context add-network <name> <cidr> | context add-git <remote> --project <p>
# schema (post-MVP)
noenv schema init | validate | generate-env | docs
# export (bridge)
noenv export --format dotenv|json|shell [--redact] [--temporary -- <cmd>]
# server (V1)
noenv server start | migrate | create-user | create-project
```

Bare `noenv foo` (no `--`) is an **error**, not a guess.

---

## 13. Local store schema (SQLite)

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, git_remote TEXT, created_at TEXT NOT NULL
);
CREATE TABLE modes (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE secrets (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, mode_id TEXT, key TEXT NOT NULL,
  value_encrypted BLOB NOT NULL,
  enc_key_id TEXT NOT NULL,            -- which master/data key wrapped this row
  enc_alg TEXT NOT NULL,              -- e.g. "aes-256-gcm"
  secret_type TEXT DEFAULT 'env',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE context_rules (
  id TEXT PRIMARY KEY, project_id TEXT, rule_type TEXT NOT NULL, matcher TEXT NOT NULL,
  mode TEXT NOT NULL, enabled INTEGER DEFAULT 0, priority INTEGER DEFAULT 100
);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, project_id TEXT, action TEXT NOT NULL, key TEXT, mode TEXT,
  context_json TEXT, created_at TEXT NOT NULL
);
```

`enc_key_id` / `enc_alg` are the envelope metadata the v0.1 schema was missing.

---

## 14. Server (V1) — broker-first

Default posture: **store references + ACLs + audit, fetch from external managers**
(ADR-0001). Optional encrypted storage only for teams without an existing manager.
Capabilities: user/team/project management, access policies, audit logs, API /
machine / CI tokens. Stack: Node/TypeScript, Fastify or Hono, Drizzle, SQLite
(small) → Postgres (production), REST first, UI later.

Borrow from Knox where it fits the broker model: ACL roles (`Admin/Write/Read/None`)
over principals (user, machine, machine-prefix, service); mTLS for machines and
OAuth for users.

---

## 15. Policy System (V1)

```json
{
  "policies": [{
    "name": "no-prod-on-personal",
    "allow": { "modes": ["local","dev"], "networks": ["home","corp-vpn"] },
    "deny":  { "modes": ["prod"] }
  }]
}
```

Use cases: keep prod off unknown networks and personal machines, scope CI tokens
to CI, bind local secrets to matching repos, require MFA for sensitive modes
(later).

---

## 16. MVP (v0.1) — five commands + import

> Proves exactly one thing: *a developer runs a command with secrets resolved at
> runtime, with no committed and no plaintext `.env` in the repo.*

**In:** `init` · `set`/`list`/`remove` · `import .env` · `noenv -- <cmd>` ·
explicit `--mode` + `--dry-run` · local SQLite with **real** OS-keychain-backed
encryption.

**Out (deferred):** schema/validation, dotenv export, `doctor`, network/IP rules,
git-branch rules, TS-type/doc generation, server.

`import` ships in MVP precisely because every adopter already has `.env` files; a
one-command migration is what makes adoption real.

---

## 17. Roadmap

- **V1 (teams):** broker server, `login`, link/RBAC, remote resolution, audit
  logs, opt-in branch & network rules, schema docs, provider plugin API +
  AWS Secrets Manager + 1Password, CI mode.
- **V1.5:** web UI, version history, approval flows, GitHub Actions / Docker
  integration, shell completions, policy-as-code, **optional daemon/file-watch
  mode for live rotation** (ADR-0002).
- **V2:** hosted cloud, org management, SSO/SAML/SCIM, fine-grained RBAC, MFA,
  dynamic/leased credentials, k8s agent, AI-agent-safe injection.

---

## 18. Success Metrics

- **Adoption:** install→first successful `noenv --` under 5 min; # projects init'd;
  # commands run; # `.env` files imported & deleted.
- **Security:** reduction in committed `.env` files; reduction in plaintext local
  secret files; # risky exports warned/blocked; audit coverage of resolutions.
- **Team:** # projects linked; users/project; provider integrations configured;
  successful CI runs.

---

## 19. Decided (formerly "open questions")

| # | Question | Decision |
|---|---|---|
| 1 | Package name | `@noenv/cli`, bin `noenv`. No "snow". |
| 2 | Schema format | JSON Schema-compatible JSON. |
| 3 | Local store | SQLite **and** OS keychain (keychain holds master key). |
| 4 | Prod secrets locally? | **Never.** Brokered from remote only. |
| 5 | Network/IP resolution | Opt-in, off by default, prints resolved mode. |
| 6 | `--` vs `run` | `noenv -- <cmd>` primary; `noenv run -- <cmd>` alias; bare = error. |
| 7 | Committed references | Yes — references/pointers only, never ciphertext. |
| 8 | Server store vs broker | **Broker-first**, optional storage (ADR-0001). |
| 9 | Commit schemas | Yes (post-MVP); they're docs, no secrets. |
| 10 | Temp `.env` gating | Not `--unsafe`; default stdout + auto-gitignore + auto-cleanup + warning. |

---

## 20. Positioning

> `.env` files were a useful convention, but they were never a security boundary.
> NoEnv keeps the convenience of environment variables while removing the habit of
> storing and committing them — and is honest about the line between "fewer
> leaked files" and "runtime secret protection."

---

## 21. Repository Structure

```
noenv/
  packages/
    cli/            core/            schema/
    providers/      local-sqlite/  noenv-server/  aws-secrets-manager/  onepassword/
  apps/             server/        web/
  examples/         node-express/  python-fastapi/  docker-compose/
  docs/             PRD.md         adr/
```
