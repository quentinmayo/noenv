import test from "node:test";
import assert from "node:assert/strict";
import { parseArgv } from "./parse.js";

test("implicit run with options before --", () => {
  const p = parseArgv(["--mode", "staging", "--", "npm", "run", "dev"]);
  assert.equal(p.command, "run");
  assert.deepEqual(p.childArgv, ["npm", "run", "dev"]);
  assert.equal(p.options["mode"], "staging");
});

test("bare -- is run", () => {
  const p = parseArgv(["--", "node", "x.js"]);
  assert.equal(p.command, "run");
  assert.deepEqual(p.childArgv, ["node", "x.js"]);
});

test("set subcommand with value flag and positional", () => {
  const p = parseArgv(["set", "DATABASE_URL", "--value", "x"]);
  assert.equal(p.command, "set");
  assert.deepEqual(p.positionals, ["DATABASE_URL"]);
  assert.equal(p.options["value"], "x");
});

test("--flag=value form", () => {
  const p = parseArgv(["list", "--mode=local"]);
  assert.equal(p.options["mode"], "local");
});

test("boolean flag", () => {
  const p = parseArgv(["--dry-run", "--", "ls"]);
  assert.equal(p.options["dry-run"], true);
});

test("unknown command is left for the router", () => {
  assert.equal(parseArgv(["frobnicate"]).command, "frobnicate");
});

test("--version and no args", () => {
  assert.equal(parseArgv(["--version"]).command, "version");
  assert.equal(parseArgv([]).command, "help");
});
