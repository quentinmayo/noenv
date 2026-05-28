import { execFileSync } from "node:child_process";
import type { GitContext } from "../types.js";

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Normalize a git remote to "host/path" form:
 *   git@github.com:owner/repo.git    -> github.com/owner/repo
 *   https://github.com/owner/repo.git -> github.com/owner/repo
 */
export function normalizeRemote(url: string): string {
  let s = url.trim().replace(/^git\+/, "");
  const ssh = s.match(/^[^@/]+@([^:]+):(.+)$/);
  if (ssh) {
    s = `${ssh[1]}/${ssh[2]}`;
  } else {
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]+@/, "");
  }
  return s.replace(/\.git$/, "").replace(/\/+$/, "");
}

export function detectGit(cwd: string): GitContext {
  const root = git(["rev-parse", "--show-toplevel"], cwd);
  if (!root) return {};
  const raw = git(["config", "--get", "remote.origin.url"], cwd);
  const ctx: GitContext = { root };
  if (raw) {
    ctx.rawRemote = raw;
    ctx.remote = normalizeRemote(raw);
  }
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (branch) ctx.branch = branch;
  const sha = git(["rev-parse", "--short", "HEAD"], cwd);
  if (sha) ctx.sha = sha;
  return ctx;
}
