import test from "node:test";
import assert from "node:assert/strict";
import { quoteArg } from "./spawn.js";

test("leaves simple args unquoted", () => {
  assert.equal(quoteArg("simple"), "simple");
  assert.equal(quoteArg("npm"), "npm");
});

test("quotes args containing spaces", () => {
  const q = quoteArg("a b");
  assert.notEqual(q, "a b");
  assert.ok(q.includes("a b"));
});

test("quotes empty string", () => {
  assert.notEqual(quoteArg(""), "");
});
