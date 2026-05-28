# ADR-0001 — Storage model: broker vs. store

- **Status:** Proposed
- **Date:** 2026-05-27
- **Deciders:** Quentin Mayo
- **Related:** [PRD §3, §10, §14](../PRD.md) · [ADR-0002](./0002-delivery-model-launch-time-vs-daemon.md)

## Context

The NoEnv server (V1) can take one of two postures toward secret values:

1. **Store** — the server holds the actual secret bytes (encrypted at rest) and
   serves them to authenticated clients. This is what Pinterest's Knox does: a
   central service stores keys/secrets, versions them, encrypts at rest via a
   "cryptor" wrapping a master key, and serves them over mTLS/OAuth with ACLs.
2. **Broker** — the server holds only *references* (provider + path + version),
   ACLs, and audit logs. The actual values live in an external manager (AWS
   Secrets Manager, SSM, 1Password, Vault, Doppler, GCP/Azure). The server
   brokers access and records who fetched what; it never possesses the secret.

Knox works as a store because Pinterest operates it with a hardware/KMS-backed
master key and a dedicated SRE/security team. A small team adopting NoEnv has
neither. A server that stores real secrets becomes a high-value attack target and
drags in compliance obligations (key custody, encryption audits, breach scope)
that most early adopters cannot meet.

The product also has a hard rule (PRD §10.1): **prod secrets are never stored in
the local provider** — they must come from a remote source with audit. That rule
is far easier to honor if the remote source is a broker in front of a real
manager than if NoEnv becomes yet another place prod secrets live.

The user has also asked that NoEnv "be verbose enough to support different
options" — i.e., not force a single storage philosophy on every team.

## Decision

**Broker-first, store-optional.**

- The default and recommended server posture is **broker**: store references,
  ACLs, and audit; resolve values from external managers at request time; never
  persist the secret value.
- The server **also** supports an **optional encrypted store** mode for teams
  that have no external manager and explicitly opt in. When enabled it uses
  envelope encryption with a master key in a KMS/HSM (or, for self-host, a
  documented key-custody setup) — never an application-config secret.
- The choice is per-project configuration, not a global build-time fork. Both
  modes expose the same provider interface to the CLI, so clients don't care
  which is in use.
- Local mode (solo) is always a store (encrypted SQLite, OS-keychain master key),
  but is **forbidden from holding prod-tagged secrets**.

## Consequences

**Positive**
- Smallest attack surface and compliance burden by default; a server breach in
  broker mode leaks references and audit logs, not secrets.
- Honors "no prod secrets on laptops / in NoEnv" cleanly.
- Meets the "support different options" requirement: teams with an existing
  manager get broker; teams without get optional storage; solo devs get local.
- Same provider interface everywhere keeps the CLI simple.

**Negative / costs**
- Broker mode depends on the availability and latency of the upstream manager.
- Two code paths (broker, optional-store) to build and test, plus the local store.
- Optional-store mode still requires a real key-custody story; it must not become
  the easy default, or we recreate the problem this ADR avoids.

**Mitigations**
- Ship broker + at least one upstream (AWS Secrets Manager) before optional-store.
- Cache references and short-TTL resolved values in the client only as allowed by
  policy; never persist on disk by default.
- Make optional-store mode loud about its key-custody requirements at enable time.

## Alternatives considered

- **Store-only (Knox-style):** rejected as a default — wrong risk/operational
  profile for NoEnv's early audience; keeps prod secrets in NoEnv.
- **Broker-only:** rejected as too rigid — excludes teams with no existing
  manager, violating the "support different options" requirement.
