import test from "node:test";
import assert from "node:assert/strict";
import { resolveMode } from "./resolve.js";
import type { NoEnvConfig, NoEnvContext } from "../types.js";

const ctx = (over: Partial<NoEnvContext> = {}): NoEnvContext => ({
  cwd: "/x",
  hostname: "h",
  username: "u",
  git: {},
  network: {},
  mode: "",
  ci: false,
  ...over,
});

const cfg = (over: Partial<NoEnvConfig> = {}): NoEnvConfig => ({
  project: "p",
  defaultMode: "local",
  providers: [],
  ...over,
});

test("explicit flag wins over everything", () => {
  const r = resolveMode({ flag: "staging", config: cfg(), context: ctx() });
  assert.equal(r.mode, "staging");
  assert.equal(r.source, "flag");
});

test("falls back to project default", () => {
  const r = resolveMode({ config: cfg({ defaultMode: "dev" }), context: ctx() });
  assert.equal(r.mode, "dev");
  assert.equal(r.source, "project-default");
});

test("disagreeing branch + network rules are ambiguous", () => {
  const config = cfg({
    rules: {
      branch: [{ pattern: "main", mode: "dev", enabled: true }],
      network: [{ name: "home", cidr: "192.168.1.0/24", mode: "home", enabled: true }],
    },
  });
  const context = ctx({ git: { branch: "main" }, network: { ip: "192.168.1.5" } });
  assert.equal(resolveMode({ config, context }).ambiguous, true);
});

test("explicit flag disambiguates conflicting rules", () => {
  const config = cfg({
    rules: {
      branch: [{ pattern: "main", mode: "dev", enabled: true }],
      network: [{ name: "home", cidr: "192.168.1.0/24", mode: "home", enabled: true }],
    },
  });
  const context = ctx({ git: { branch: "main" }, network: { ip: "192.168.1.5" } });
  const r = resolveMode({ flag: "prod", config, context });
  assert.equal(r.ambiguous, false);
  assert.equal(r.mode, "prod");
});

test("disabled rules do not drive resolution", () => {
  const config = cfg({
    rules: { network: [{ name: "home", cidr: "192.168.1.0/24", mode: "home", enabled: false }] },
  });
  const context = ctx({ network: { ip: "192.168.1.5" } });
  assert.equal(resolveMode({ config, context }).mode, "local");
});
