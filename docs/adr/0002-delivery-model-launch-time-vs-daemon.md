# ADR-0002 — Delivery model: launch-time injection vs. daemon

- **Status:** Proposed
- **Date:** 2026-05-27
- **Deciders:** Quentin Mayo
- **Related:** [PRD §3, §6.3](../PRD.md) · [ADR-0001](./0001-storage-model-broker-vs-store.md)

## Context

NoEnv must get resolved secrets into the target process. Two delivery models:

1. **Launch-time injection** — resolve at spawn, set the child process's
   environment, run, preserve exit code, stream stdio. Simple, no background
   process, "just a wrapper."
2. **Daemon / file-watch** — a long-running agent caches secrets (typically to a
   tmpfs file the app reads/watches) and refreshes them on a timer and on
   rotation. This is Pinterest Knox's model: a client daemon registers needed
   keys, writes their contents to a local directory, and keeps them current so
   apps pick up rotations without restarting.

The two models differ on one property that the v0.1 PRD glossed over:
**environment variables are immutable for the life of a process.** Once `npm run
dev` is spawned with `DATABASE_URL` in its environment, nothing — not NoEnv, not
the OS — can change that value in the running process. So launch-time injection
**cannot** deliver live rotation; only a file/watch (daemon) model can.

The v0.1 draft listed both "runtime env injection" and "secret rotation
concepts" as goals, and even a "clears values when process exits" step — which is
a no-op, since env vars are already gone when a process dies. These are in
tension and must be resolved, not both promised.

There is also a security trade: the daemon model writes secrets to a file (even
tmpfs), reintroducing an at-rest, app-readable artifact — exactly the kind of
thing NoEnv exists to avoid. Launch-time injection keeps secrets to process
memory and never touches disk.

## Decision

**Launch-time injection is the default and the only model in MVP/V1.**

- `noenv -- <cmd>` resolves at spawn and injects into the child environment.
  Nothing is written to disk; no daemon runs.
- **Rotation semantics are "next run":** rotating a secret takes effect the next
  time the command is launched. NoEnv does not push rotations into live
  processes, and the PRD/README say so plainly. The misleading "clears values on
  exit" step is removed.
- A **daemon / file-watch mode is a documented future option (V1.5+)**, opt-in
  per project, for the narrow set of users who genuinely need live rotation into
  long-running local processes. It is never the default and comes with an
  explicit note that it writes secrets to a (tmpfs) file.
- The legacy bridge (`noenv export --temporary -- <cmd>`) covers tools that
  *require* a real `.env` file: write temp file, run, auto-delete. This is a
  file-based escape hatch, not the daemon.

## Consequences

**Positive**
- Keeps NoEnv "a wrapper, not a platform" — no background process to install,
  supervise, or secure.
- Secrets stay in process memory; no new at-rest artifact in the default path.
- Honest, simple mental model: "the value you get is the value at launch."
- Leaves room to add the daemon later for the users who truly need it, without
  blocking v1 or compromising the default.

**Negative / costs**
- No live rotation in the default model; long-running dev servers must be
  restarted to pick up a rotated secret. Acceptable for local dev; documented.
- If/when the daemon ships, it adds a meaningfully different security profile
  (file at rest, refresh logic, supervision) that must be gated and well
  documented.

## Alternatives considered

- **Daemon-first (Knox-style):** rejected for v1 — contradicts "just a wrapper,"
  reintroduces secrets-on-disk by default, and is far more to build/operate than
  the core thesis needs.
- **Promise both equally (v0.1 framing):** rejected — env immutability makes
  "inject at runtime" and "live rotation" mutually exclusive in one model;
  promising both erodes trust.
