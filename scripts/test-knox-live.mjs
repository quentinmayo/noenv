// Explicit integration test: creates/rotates/deletes ONLY its own unique fixture.
// Requires a configured, trusted native Knox client and a built NoEnv checkout.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const knox = process.env.NOENV_KNOX_COMMAND || 'knox';
const cli = path.resolve(import.meta.dirname, '../dist/index.js');
const id = `noenv:integration:${randomUUID().replaceAll('-', '')}`;
const dir = mkdtempSync(path.join(tmpdir(), 'noenv-knox-live-'));
const env = { ...process.env, NOENV_HOME: path.join(dir, 'state'), NOENV_MODE: 'dev', NOENV_KNOX_COMMAND: knox };
const cfg = { project: 'noenv-integration', defaultMode: 'dev', providers: [{
  name: 'knox', type: 'knox', command: knox,
  projects: { 'noenv-integration': { dev: { NOENV_TEST_VALUE: id } } },
}] };
const save = () => writeFileSync(path.join(dir, 'noenv.config.json'), JSON.stringify(cfg));
function invoke(exe, args, input, expected = 0) {
  const result = spawnSync(exe, args, { input, cwd: dir, env, timeout: 20000, maxBuffer: 1024 * 1024 });
  // Never surface stdout/stderr/errors, which may carry credentials or values.
  if (result.status !== expected) throw new Error(`Unexpected exit from ${exe === knox ? 'Knox' : 'NoEnv'} ${args[0]} (expected ${expected}, got ${result.status}).`);
  return result.stdout;
}
const noenv = (args, expected = 0) => invoke(process.execPath, [cli, ...args], undefined, expected);
const first = Buffer.from('  noenv disposable fixture ☃\n\n');
const second = Buffer.from('noenv disposable rotated fixture\n');
let created = false;
let clean = false;
try {
  save();
  invoke(knox, ['create', id], first);
  created = true;
  // Equality assertions intentionally contain no values on failure.
  if (!invoke(knox, ['get', '-n', id]).equals(first)) throw new Error('Direct Knox fixture mismatch.');
  if (!noenv(['get', 'NOENV_TEST_VALUE', '--mode', 'dev']).equals(Buffer.concat([first, Buffer.from('\n')]))) throw new Error('NoEnv get fixture mismatch.');
  noenv(['--mode', 'dev', '--', process.execPath, '-e', 'if(process.env.NOENV_TEST_VALUE !== "  noenv disposable fixture ☃\\n\\n") process.exit(9)']);
  noenv(['--mode', 'dev', '--', process.execPath, '-e', 'process.exit(7)'], 7);
  noenv(['--mode', 'dev', '--dry-run', '--', process.execPath, '-e', 'process.exit(9)']);
  const exported = JSON.parse(noenv(['export', '--mode', 'dev', '--format', 'json']));
  if (exported.NOENV_TEST_VALUE !== first.toString()) throw new Error('Export fixture mismatch.');
  noenv(['list', '--mode', 'dev']);
  noenv(['set', 'NOENV_TEST_VALUE', '--mode', 'dev'], 1);
  noenv(['remove', 'NOENV_TEST_VALUE', '--mode', 'dev', '--yes'], 1);
  const added = invoke(knox, ['add', id], second).toString().trim();
  const version = /^(?:Added key version )?(\d+)$/m.exec(added)?.[1];
  if (!version) throw new Error('Unexpected Knox version format.');
  invoke(knox, ['promote', id, version]);
  noenv(['--mode', 'dev', '--', process.execPath, '-e', 'if(process.env.NOENV_TEST_VALUE !== "noenv disposable rotated fixture\\n") process.exit(9)']);
  cfg.providers[0].projects['noenv-integration'].dev.NOENV_TEST_VALUE = `${id}:missing`;
  save();
  noenv(['--mode', 'dev', '--', process.execPath, '-e', 'require("fs").writeFileSync("child-started", "yes")'], 1);
  assert.ok(!existsSync(path.join(dir, 'child-started')), 'A failed read launched the child.');
  noenv(['--mode', 'unknown', '--', process.execPath, '-e', 'process.exit(9)'], 1);
  assert.ok(!existsSync(env.NOENV_HOME), 'Remote use unexpectedly created local state.');
  assert.ok(!existsSync(path.join(dir, '.env')), 'Remote use unexpectedly wrote .env.');
  console.log('PASS: live Knox retrieval, byte preservation, injection, exit code, dry run, list/export, read-only writes, rotation, missing-key and unknown-scope refusal, no local store/plaintext file.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live integration failed.');
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      invoke(knox, ['delete', id]);
      invoke(knox, ['get', '-n', id], undefined, 1);
      clean = true;
      console.log('PASS: disposable Knox key deleted and subsequent read rejected.');
    } catch {
      console.error(`Fixture cleanup requires attention: ${id}`);
      process.exitCode = 1;
    }
  }
  rmSync(dir, { recursive: true, force: true });
  if (created && !clean) process.exitCode = 1;
}
