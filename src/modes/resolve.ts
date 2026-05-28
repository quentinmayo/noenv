import type { GlobalConfig, NoEnvConfig, NoEnvContext } from "../types.js";
import { matchNetwork } from "../context/network.js";

export interface ModeCandidate {
  source: string;
  mode: string;
}

export interface ModeResolution {
  mode: string;
  source: string;
  candidates: ModeCandidate[];
  ambiguous: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function branchMatches(pattern: string, branch: string): boolean {
  const re = new RegExp("^" + pattern.split("*").map(escapeRe).join(".*") + "$");
  return re.test(branch);
}

/**
 * Mode precedence (first defined wins):
 *   1. --mode flag        2. NOENV_MODE env
 *   3. branch rule (opt-in)   4. network rule (opt-in)
 *   5. project default    6. global default   (fallback: "local")
 *
 * If branch and network rules disagree and there's no explicit flag/env,
 * resolution is *ambiguous* — the caller must refuse to guess.
 */
export function resolveMode(opts: {
  flag?: string;
  config?: NoEnvConfig | null;
  global?: GlobalConfig | null;
  context: NoEnvContext;
}): ModeResolution {
  const { flag, config, global, context } = opts;
  const candidates: ModeCandidate[] = [];

  if (flag) candidates.push({ source: "flag", mode: flag });
  if (process.env.NOENV_MODE) candidates.push({ source: "env", mode: process.env.NOENV_MODE });

  const branchRules = (config?.rules?.branch ?? []).filter((r) => r.enabled);
  if (context.git.branch) {
    for (const r of branchRules) {
      if (branchMatches(r.pattern, context.git.branch)) {
        candidates.push({ source: `branch:${r.pattern}`, mode: r.mode });
        break;
      }
    }
  }

  const netMatch = matchNetwork(config?.rules?.network ?? [], context.network.ip);
  if (netMatch) candidates.push({ source: `network:${netMatch.name}`, mode: netMatch.mode });

  if (config?.defaultMode) candidates.push({ source: "project-default", mode: config.defaultMode });
  if (global?.defaultMode) candidates.push({ source: "global-default", mode: global.defaultMode });
  if (candidates.length === 0) candidates.push({ source: "fallback", mode: "local" });

  const explicit =
    candidates.find((c) => c.source === "flag") ?? candidates.find((c) => c.source === "env");
  if (explicit) {
    return { mode: explicit.mode, source: explicit.source, candidates, ambiguous: false };
  }

  const branchCand = candidates.find((c) => c.source.startsWith("branch:"));
  const netCand = candidates.find((c) => c.source.startsWith("network:"));
  if (branchCand && netCand && branchCand.mode !== netCand.mode) {
    return { mode: "", source: "ambiguous", candidates, ambiguous: true };
  }

  const chosen = candidates[0] ?? { source: "fallback", mode: "local" };
  return { mode: chosen.mode, source: chosen.source, candidates, ambiguous: false };
}
