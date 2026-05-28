import test from "node:test";
import assert from "node:assert/strict";
import { parseDotenv, toDotenv } from "./dotenv.js";

test("parses comments, export prefix, quotes, inline comments", () => {
  const r = parseDotenv(`# comment\nFOO=bar\nexport BAZ="hello world"\nQUX='a b'\nNUM=42 # inline\n`);
  assert.deepEqual(r, { FOO: "bar", BAZ: "hello world", QUX: "a b", NUM: "42" });
});

test("round-trips through toDotenv", () => {
  const original = { A: "simple", B: "with space", C: "", D: "has#hash" };
  assert.deepEqual(parseDotenv(toDotenv(original)), original);
});
