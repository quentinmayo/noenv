import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KnoxProvider } from "./knox.js";
import { buildProviders, firstWritable } from "../core/session.js";
import { applicationEnvironment } from "../util/environment.js";
import type { NoEnvConfig, ProviderConfig } from "../types.js";

// Never let a user's executable override turn unit tests into live reads.
const originalCommand = process.env.NOENV_KNOX_COMMAND;
before(() => { delete process.env.NOENV_KNOX_COMMAND; });
after(() => {
  if (originalCommand === undefined) delete process.env.NOENV_KNOX_COMMAND;
  else process.env.NOENV_KNOX_COMMAND = originalCommand;
});

const scope = { project: "fixture", mode: "dev" };
function config(command = "knox", id = "fixture:ok"): ProviderConfig {
  return { name: "test-knox", type: "knox", command, projects: { fixture: { dev: { TEST_VALUE: id } } } };
}

const fixtureSource = `#!${process.execPath}
if (process.argv[2] !== 'get' || process.argv[3] !== '-n' || process.argv.length !== 5) process.exit(91);
switch (process.argv[4]) {
  case 'fixture:ok': process.stdout.write('  hello ☃\\n\\n'); break;
  case 'fixture:empty': break;
  case 'fixture:bad': process.stdout.write(Buffer.from([255])); break;
  case 'fixture:nul': process.stdout.write('x\\0y'); break;
  case 'fixture:large': process.stdout.write('x'.repeat(2 * 1024 * 1024)); break;
  case 'fixture:hang': setTimeout(() => {}, 60000); break;
  case 'fixture:fail': process.stdout.write('DO_NOT_LEAK'); process.stderr.write('DO_NOT_LEAK'); process.exit(1); break;
  default: process.exit(2);
}
`;

test("Knox validates mappings, timeout, and executable config", () => {
  for (const override of [
    { projects: {} }, { projects: { fixture: { dev: {} } } },
    { projects: { fixture: { dev: { BAD: "$(echo secret)" } } } },
    { projects: { fixture: { dev: { "BAD=ENV": "valid:id" } } } },
    { timeoutMs: 0 }, { timeoutMs: 120001 }, { timeoutMs: "100" }, { command: "" },
  ]) assert.throws(() => new KnoxProvider({ ...config(), ...override }));
});

test("Knox metadata is local, exact-scoped, and read-only", async () => {
  const provider = new KnoxProvider(config("does-not-exist"));
  assert.deepEqual(await provider.list(scope), [{ key: "TEST_VALUE", mode: "dev", provider: "test-knox", secret: true }]);
  assert.equal(await provider.getSecret({ ...scope, key: "UNMAPPED" }), null);
  await assert.rejects(provider.list({ ...scope, mode: "prod" }), /No Knox mapping/);
  await assert.rejects(provider.list({ project: "other", mode: "dev" }), /No Knox mapping/);
  await assert.rejects(provider.getSecret({ project: "__proto__", mode: "dev", key: "TEST_VALUE" }), /No Knox mapping/);
  await assert.rejects(provider.set({ ...scope, key: "TEST_VALUE", value: "x" }), /read-only/);
  await assert.rejects(provider.remove({ ...scope, key: "TEST_VALUE" }), /read-only/);
  provider.close();
  await assert.rejects(provider.list(scope), /closed/);
});

test("Knox-only factory needs no local cipher", async () => {
  const providers = await buildProviders({ project: "fixture", defaultMode: "dev", providers: [config()] }, null);
  assert.equal(providers.length, 1);
  assert.throws(() => firstWritable(providers), /no writable provider/);
  providers.forEach((p) => p.close());
  await assert.rejects(buildProviders(null, null), /requires initialization/);
});

test("application environment strips known bootstrap credentials without mutating parent", () => {
  const env = { PATH: "/bin", NOENV_PASSPHRASE: "a", KNOX_USER_AUTH: "b", KNOX_MACHINE_AUTH: "c", KNOX_SERVICE_AUTH: "d" };
  assert.deepEqual(applicationEnvironment(env), { PATH: "/bin" });
  assert.equal(env.KNOX_USER_AUTH, "b");
});

test("Knox native-client transport and CLI integration", { skip: process.platform === "win32" }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noenv-knox-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const command = path.join(dir, "fake knox");
  fs.writeFileSync(command, fixtureSource, { mode: 0o700 });

  await t.test("preserves UTF-8, empty values and trailing newlines", async () => {
    for (const [id, value] of [["fixture:ok", "  hello ☃\n\n"], ["fixture:empty", ""]]) {
      const p = new KnoxProvider(config(command, id));
      assert.deepEqual(await p.resolveAll(scope), [{ key: "TEST_VALUE", value, provider: "test-knox", secret: true }]);
      p.close();
    }
  });

  await t.test("rejects invalid bytes, process errors, output limits and timeouts without leaking output", async () => {
    for (const id of ["fixture:bad", "fixture:nul", "fixture:large", "fixture:hang", "fixture:fail"]) {
      const p = new KnoxProvider({ ...config(command, id), timeoutMs: id === "fixture:hang" ? 100 : 3000 });
      await assert.rejects(p.resolveAll(scope), (error: Error) => {
        assert.ok(!error.message.includes("DO_NOT_LEAK"));
        assert.ok(!("stdout" in error));
        return /Knox/.test(error.message);
      });
      p.close();
    }
  });

  await t.test("missing executable and close cancel reads", async () => {
    const missing = new KnoxProvider(config(path.join(dir, "absent")));
    await assert.rejects(missing.resolveAll(scope), /Knox read failed/);
    missing.close();
    const p = new KnoxProvider(config(command, "fixture:hang"));
    const result = p.resolveAll(scope);
    p.close();
    await assert.rejects(result, /Knox read failed/);
  });

  await t.test("remote-only CLI injects values, fails closed, supports export and redacts schema errors", () => {
    const cfg: NoEnvConfig = { project: "fixture", defaultMode: "dev", providers: [config(command)] };
    const cfgPath = path.join(dir, "noenv.config.json");
    const save = () => fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    save();
    const cli = path.resolve(import.meta.dirname, "../index.js");
    const env = { ...process.env, NOENV_HOME: path.join(dir, "state"), NOENV_MODE: "dev", NOENV_KNOX_COMMAND: command, NOENV_PASSPHRASE: "bootstrap", KNOX_USER_AUTH: "bootstrap" };
    const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: "utf8", timeout: 5000 });
    const child = 'if(process.env.TEST_VALUE !== "  hello ☃\\n\\n" || process.env.NOENV_PASSPHRASE || process.env.KNOX_USER_AUTH) process.exit(9)';
    assert.equal(run(["--", process.execPath, "-e", child]).status, 0);
    assert.equal(run(["--", process.execPath, "-e", "process.exit(7)"]).status, 7);
    assert.equal(run(["set", "TEST_VALUE"]).status, 1); // must reject before prompting
    assert.equal(run(["remove", "TEST_VALUE", "--yes"]).status, 1);
    assert.equal(JSON.parse(run(["export", "--format", "json"]).stdout).TEST_VALUE, "  hello ☃\n\n");
    fs.writeFileSync(path.join(dir, "noenv.schema.json"), JSON.stringify({ variables: { TEST_VALUE: { type: "number", secret: true } } }));
    const invalid = run(["schema", "validate"]);
    assert.equal(invalid.status, 1);
    assert.ok(!invalid.stderr.includes("hello"));
    assert.equal(run(["doctor"]).status, 0);
    assert.ok(!fs.existsSync(env.NOENV_HOME));
    // A mixed chain must retain local CRUD and must not hide a failed mapped
    // remote read behind the same key in the local store.
    const local = { name: "local", type: "sqlite" };
    cfg.providers = [local]; save();
    assert.equal(run(["init", "--project", "fixture", "--passphrase"]).status, 0);
    assert.equal(run(["set", "TEST_VALUE", "--value=local-fallback"]).status, 0);
    assert.equal(run(["get", "TEST_VALUE"]).stdout.trim(), "local-fallback");
    cfg.providers = [config(command), local]; save();
    assert.equal(JSON.parse(run(["export", "--format", "json"]).stdout).TEST_VALUE, "  hello ☃\n\n");
    cfg.providers = [config(command, "fixture:fail"), local]; save();
    const failed = run(["--", process.execPath, "-e", 'require("fs").writeFileSync("child-started", "yes")']);
    assert.equal(failed.status, 1);
    assert.ok(!failed.stderr.includes("DO_NOT_LEAK"));
    assert.ok(!fs.existsSync(path.join(dir, "child-started")));
  });
});
