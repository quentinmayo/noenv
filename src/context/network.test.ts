import test from "node:test";
import assert from "node:assert/strict";
import { cidrContains } from "./network.js";

test("cidrContains matches IPv4 ranges", () => {
  assert.ok(cidrContains("192.168.1.0/24", "192.168.1.25"));
  assert.ok(!cidrContains("192.168.1.0/24", "192.168.2.1"));
  assert.ok(cidrContains("10.0.0.0/8", "10.255.1.2"));
  assert.ok(cidrContains("0.0.0.0/0", "8.8.8.8"));
});

test("cidrContains rejects malformed input", () => {
  assert.ok(!cidrContains("192.168.1.0/24", "not-an-ip"));
  assert.ok(!cidrContains("garbage", "1.2.3.4"));
});
