import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createCipher } from "./envelope.js";

test("encrypt/decrypt round-trips", () => {
  const cipher = createCipher("test", crypto.randomBytes(32));
  const enc = cipher.encrypt("hello secret");
  assert.notEqual(enc.ciphertext, "hello secret");
  assert.equal(cipher.decrypt(enc), "hello secret");
});

test("a different key cannot decrypt", () => {
  const a = createCipher("a", crypto.randomBytes(32));
  const b = createCipher("b", crypto.randomBytes(32));
  assert.throws(() => b.decrypt(a.encrypt("x")));
});

test("rejects non-32-byte key", () => {
  assert.throws(() => createCipher("z", Buffer.alloc(16)));
});

test("ciphertext is non-deterministic (random IV)", () => {
  const c = createCipher("t", crypto.randomBytes(32));
  assert.notEqual(c.encrypt("same").ciphertext, c.encrypt("same").ciphertext);
});
