import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRemote } from "./git.js";

test("normalizes ssh, https, and embedded-user remotes", () => {
  assert.equal(normalizeRemote("git@github.com:owner/repo.git"), "github.com/owner/repo");
  assert.equal(normalizeRemote("https://github.com/owner/repo.git"), "github.com/owner/repo");
  assert.equal(normalizeRemote("https://user@github.com/owner/repo"), "github.com/owner/repo");
  assert.equal(normalizeRemote("git@gitlab.com:group/sub/repo.git"), "gitlab.com/group/sub/repo");
});
