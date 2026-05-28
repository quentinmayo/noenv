import os from "node:os";
import type { NoEnvContext } from "../types.js";
import { detectGit } from "./git.js";
import { localIPv4 } from "./network.js";

export function detectCI(): boolean {
  const e = process.env;
  return Boolean(
    e.CI || e.GITHUB_ACTIONS || e.GITLAB_CI || e.CIRCLECI || e.BUILDKITE || e.TF_BUILD || e.JENKINS_URL,
  );
}

/** Build the full context. `mode` is filled in later by the mode resolver. */
export function buildContext(cwd = process.cwd()): NoEnvContext {
  return {
    cwd,
    hostname: os.hostname(),
    username: os.userInfo().username,
    git: detectGit(cwd),
    network: { ip: localIPv4() },
    mode: "",
    ci: detectCI(),
  };
}
