<div align="center">

<img src="docs/assets/banner.svg" alt="NoEnv — run commands with secrets, without committing secrets" width="100%" />

<p>
  <img src="https://img.shields.io/badge/status-v0.1%20MVP-7c3aed" alt="status: v0.1 MVP" />
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=node.js&logoColor=white" alt="node >= 22" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/tests-24%20passing-2ea44f" alt="tests: 24 passing" />
  <img src="https://img.shields.io/badge/runtime%20deps-~0-success" alt="runtime deps: ~0" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license: MIT" />
</p>

<strong>No committed secrets. &nbsp;·&nbsp; No plaintext <code>.env</code> files. &nbsp;·&nbsp; No copying tokens out of Slack.</strong>

<p>
  <a href="#-quickstart">Quickstart</a> &nbsp;·&nbsp;
  <a href="#-why">Why</a> &nbsp;·&nbsp;
  <a href="#-what-it-protects">What it protects</a> &nbsp;·&nbsp;
  <a href="#-commands">Commands</a> &nbsp;·&nbsp;
  <a href="#%EF%B8%8F-modes">Modes</a> &nbsp;·&nbsp;
  <a href="#%EF%B8%8F-configuration">Config</a> &nbsp;·&nbsp;
  <a href="#-roadmap">Roadmap</a>
</p>

</div>

---

**NoEnv** resolves your environment variables at runtime and injects them *only*
into the command you run. Secrets live encrypted in a per-user store outside your
repo and are decrypted in memory at launch — so there's no `.env` file to
accidentally commit, paste into chat, or leave behind on disk.

```bash
noenv -- npm run dev
```

> [!NOTE]
> **v0.1 is local-first** — an encrypted local store with runtime injection. The
> team/server, remote providers, and schema docs are on the [roadmap](#-roadmap).
> Design rationale lives in [`docs/PRD.md`](docs/PRD.md) and the
> [ADRs](docs/adr/).

---

## ⚡ Quickstart

```bash
npm install -g @noenv/cli

noenv init                  # set up NoEnv in this project (and your machine, once)
noenv set DATABASE_URL      # prompts for the value — never echoed, never on the CLI
noenv set OPENAI_API_KEY
noenv -- npm run dev        # resolve, inject, run
```

Already have a `.env`? Migrate it in one step:

```bash
noenv import .env           # encrypt into the store + add .env to .gitignore
rm .env                     # delete the plaintext copy
```

---

## 🤔 Why

`.env` files were a useful convention, but they were never a security boundary.

<table>
<tr><th>The old way</th><th>With NoEnv</th></tr>
<tr><td>

```bash
# .env (one git add away from a leak)
DATABASE_URL=postgres://…
OPENAI_API_KEY=sk-live-…

$ npm run dev
```

</td><td>

```bash
# nothing secret in the repo
# values resolved at launch, in memory

$ noenv -- npm run dev
```

</td></tr>
</table>

---

## 🧊 What it protects

NoEnv is honest about its threat coverage — overstating it is how security tools lose trust.

| Threat | Covered? |
| --- | --- |
| Accidental `git commit` of secrets | ✅ nothing secret is in the repo |
| Secrets pasted into chat / shell history | ✅ values are prompted, never on the command line |
| Plaintext `.env` at rest in the repo | ✅ replaced by an encrypted store |
| Laptop theft → secret compromise | ⚠️ partial — local mode ≈ OS-keychain strength |
| Secret readable in a *running* process | ❌ env vars are visible via `/proc`, `ps e`, crash dumps, child processes |
| Live rotation into a *running* process | ❌ rotation applies on the **next run** (env vars are immutable for a process's life) |

> **In one line:** local mode trades *"plaintext in the repo"* for *"encrypted
> outside the repo, key in the OS keychain."* Better — not a secret boundary
> against a local attacker.

---

## 🔐 Key custody

The 32-byte master key is held by one of two providers, chosen at `init`:

- **🔑 keychain** *(default when available)* — the master key lives in the OS
  keychain (macOS Keychain, Windows Credential Manager, libsecret) via a prebuilt
  native module. Seamless, no passphrase prompts.
- **🔒 passphrase** *(fallback)* — the key is derived (scrypt) from a passphrase
  plus a stored salt. Set `NOENV_PASSPHRASE` for non-interactive use, or you'll be
  prompted.

Secrets are encrypted with **AES-256-GCM**. The key is never written to disk in
plaintext, and each stored row records `enc_key_id` / `enc_alg` so the master key
can be rotated later.

---

## 🧰 Commands

| | |
| --- | --- |
| `noenv -- <cmd>` | Resolve env vars and run a command |
| `noenv --mode staging -- npm test` | Run with an explicit mode |
| `noenv --dry-run -- npm run dev` | Show the plan, run nothing |
| `noenv init` | Set up NoEnv in this project |
| `noenv set <KEY>` | Store a secret (prompted if no `--value`) |
| `noenv get <KEY> [--redact]` | Read one secret |
| `noenv list` | List keys — never values |
| `noenv remove <KEY>` | Delete a secret |
| `noenv import .env` | Migrate an existing `.env` |
| `noenv context` | Show context + resolved mode |
| `noenv doctor` | Diagnose your setup |

<details>
<summary><strong>More: schema, export & context rules</strong></summary>

```bash
# optional schema (documentation + validation)
noenv schema init | validate | generate-env | docs

# legacy-tool bridge
noenv export [--format dotenv|json|shell] [--redact]
noenv export --temporary -- npm run legacy-dev    # temp .env, run, then delete

# opt-in context rules
noenv context add-network home 192.168.1.0/24 --mode home
noenv context add-git github.com/acme/api --project api
```

</details>

---

## 🎚️ Modes

A *mode* selects which set of values to load (`local`, `dev`, `staging`, …).
Resolution is **explicit by default** — auto-selecting secrets from ambient
signals is a footgun. Precedence (first match wins):

```
1. --mode flag          ← always wins
2. NOENV_MODE env
3. branch rule          (opt-in, off by default)
4. network/CIDR rule    (opt-in, off by default)
5. project default      (noenv.config.json)
6. global default       (fallback: "local")
```

If opt-in branch and network rules disagree and there's no explicit flag, NoEnv
**refuses to guess** and asks you to pass `--mode`.

---

## ⚙️ Configuration

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

---

## 🛠️ Development

```bash
npm install          # installs the prebuilt @napi-rs/keyring (optional)
npm run build        # tsc -> dist/
npm test             # build + node:test suite (24 tests)
npm run typecheck    # tsc --noEmit
```

**Near-zero runtime dependencies by design** (smaller supply chain): the store
uses the built-in `node:sqlite`, crypto uses `node:crypto`, tests use `node:test`.
The only optional dependency is the OS-keychain binding. Requires **Node ≥ 22**
(developed on 24).

---

## 🗺️ Roadmap

<details open>
<summary><strong>Where this is headed</strong></summary>

| Stage | Highlights |
| --- | --- |
| **v0.1** *(here)* | Local encrypted store · runtime injection · explicit modes · import/export · schema · doctor |
| **V1** | Broker server · `login` + RBAC · remote providers (AWS Secrets Manager, 1Password, Vault) · audit logs · opt-in branch/network rules |
| **V1.5+** | Web UI · approval flows · GitHub Actions / Docker integrations · optional daemon for live rotation |

Remote providers slot into the existing `SecretProvider` interface without
touching the CLI. See [ADR-0001](docs/adr/0001-storage-model-broker-vs-store.md)
and [ADR-0002](docs/adr/0002-delivery-model-launch-time-vs-daemon.md).

</details>

---

<div align="center">
<sub>The safest <code>.env</code> file is the one you never had to create.</sub><br/>
<sub>MIT licensed.</sub>
</div>
