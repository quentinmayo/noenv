# ADR-0001 — Storage model: broker vs. store

- **Status:** Proposed for the team server; local SQLite is implemented
- **Date:** 2026-05-27
- **Clarified:** 2026-10-09
- **Deciders:** Quentin Mayo
- **Related:** [PRD](../PRD.md) · [ADR-0002](0002-delivery-model-launch-time-vs-daemon.md) · [Knox provider](../providers/knox.md)

## Context

The proposed NoEnv team server can take two approaches:

1. **Store:** hold encrypted secret values and serve them to authenticated
   clients. This requires key custody, recovery, rotation, and access controls.
2. **Broker:** persist references, ACLs, and audit metadata, and fetch values
   from an external secret manager when authorized clients request them.

A broker can still handle plaintext in memory and possess upstream credentials.
It reduces persistent copies but is not outside the secret trust boundary.
A compromised broker may use its credentials to retrieve upstream values.

The checkout supports encrypted local SQLite and read-only Knox. SQLite accepts any
mode name, including production, and does not enforce remote-only production
policy. The desired policy must be implemented before it becomes a guarantee.

## Proposed decision

**Broker-first, store-optional** for a future NoEnv server.

- Prefer references to an existing manager, resolving values at request time
  without persisting the values in the broker database.
- Permit optional encrypted server storage for teams without an external
  manager, with explicit key custody and recovery requirements. KMS/HSM-backed
  envelope encryption is a proposed server design, not current local behavior.
- Expose compatible provider reads to the CLI. Provider construction,
  authentication, and diagnostics still need implementation per provider.
- Keep the local encrypted store for standalone development. Introduce
  enforceable remote-only policy for production-tagged scopes in the team
  release; mode names and confirmation prompts alone do not enforce it.

## Knox compatibility

Knox can be an upstream provider without changing this storage direction.
NoEnv can read an existing deployment directly through a read-only client
adapter; that does not require NoEnv to become a server or secret store.
The [Knox provider](../providers/knox.md) documents the implemented adapter and
links to the verified upstream client behavior.

Adopting Knox as an upstream and building a new Knox-style storage server are
separate choices. NoEnv's adapter would rely on the deployment's authentication,
ACLs, and operational controls, while retaining launch-time injection.

## Consequences

**Benefits**

- Teams with an existing manager can reuse its secret lifecycle.
- Broker storage can contain references and audit rather than another durable
  copy of every value.
- Standalone local use and a future optional server store remain possible.

**Costs and limits**

- Remote resolution depends on upstream availability and latency.
- Broker credentials and in-memory values remain sensitive.
- Additional storage modes add distinct key-custody and recovery work.
- References and audit metadata can themselves reveal sensitive structure.
- The CLI still receives plaintext; remote sourcing is not a local-process sandbox.

**Implementation direction**

Ship a tested read-only upstream adapter before building optional server storage.
Use bounded requests, least-privilege identity, and explicit failure semantics.
Do not introduce persistent client value caching by default. Authentication,
central audit, and production policy must be tested and documented separately.

## Alternatives considered

- **Store-only server:** requires every adopter to operate another secret store;
  not the proposed default.
- **Broker-only forever:** excludes teams that cannot use an external manager;
  retain optional storage as a future choice.
- **Require a NoEnv server for Knox:** unnecessary for initial read-only
  integration; a direct client adapter is sufficient.
