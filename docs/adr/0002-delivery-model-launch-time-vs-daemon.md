# ADR-0002 — Delivery model: launch-time injection vs. daemon

- **Status:** Launch-time model implemented; daemon/file refresh remains proposed
- **Date:** 2026-05-27
- **Clarified:** 2026-10-09
- **Deciders:** Quentin Mayo
- **Related:** [PRD](../PRD.md) · [ADR-0001](0001-storage-model-broker-vs-store.md) · [Knox provider](../providers/knox.md)

## Context

NoEnv must deliver resolved values to an application. Two models have different
application and operational requirements:

1. **Launch-time injection:** resolve values before spawning, merge them into
   the child environment, inherit stdio, and preserve normal exit codes.
2. **Daemon/file refresh:** a background process updates files or serves an API;
   the application must read or reload those values to observe rotation.

An application can change its own environment. The limitation relevant here is
that an external wrapper cannot ordinarily update the environment of an already
running child. A background process alone cannot make a startup-only application
observe new values. File refresh, an SDK, or a coordinated restart would require
an explicit integration.

Knox supports client-side cached files and daemon workflows, but its CLI also
supports direct network reads. Using Knox as a provider therefore does not
require NoEnv to adopt a daemon. See the source references in the
[Knox provider](../providers/knox.md).

## Decision and current behavior

**Launch-time injection is the default and current implementation.**

- `noenv -- <command>` resolves values, overlays them on the inherited
  environment, and launches the child. It does not create a plaintext secret file.
- Rotation takes effect on the next resolution and launch. Running processes
  are not refreshed by NoEnv.
- The parent shell's environment is unchanged. Child processes may pass values
  to descendants or write them to logs/files; NoEnv does not control that.
- `--dry-run` still resolves/decrypts values but does not launch the command.
- There is no daemon, background refresh, or automatic restart facility.

The legacy `export --temporary -- <command>` bridge writes `.env` in cwd and
attempts deletion after the command exits. The application must read that file
itself. It is not a refresh mechanism. Forced termination can leave the file
behind, and `--force` overwrites then deletes an existing file rather than
restoring it. Details are in [usage](../usage.md).

## Proposed future option

A daemon or file/API-based delivery mode may be useful for applications that
explicitly support reload. It would be opt-in, with documented file permissions,
cache lifetime, revocation/failure behavior, and application integration. If a
memory-backed filesystem is required, support must be verified per platform;
that is not a current NoEnv feature.

## Consequences

**Benefits**

- Ordinary commands work without an SDK or background service.
- Default delivery does not create plaintext files.
- The lifecycle is explicit: restart to resolve updated values.
- Remote providers, including the Knox adapter, can use the same model.

**Costs and limits**

- Long-running applications retain their launch-time values.
- Secrets remain visible within the application/runtime security boundary.
- Legacy file export has a different exposure and cleanup profile.
- Future file refresh requires application cooperation and additional supervision.

## Alternatives considered

- **Daemon first:** adds operational work and application integration before
  proving the core command-wrapper workflow.
- **Promise live env rotation:** cannot be delivered by an external wrapper to
  arbitrary running commands; offer explicit restart or reload semantics instead.
