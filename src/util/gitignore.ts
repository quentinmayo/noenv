import fs from "node:fs";

/** Append any missing entries to a .gitignore, returning what was added. */
export function ensureGitignore(filePath: string, entries: string[]): string[] {
  let existing = "";
  try {
    existing = fs.readFileSync(filePath, "utf8");
  } catch {
    /* no file yet */
  }
  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const missing = entries.filter((e) => !present.has(e));
  if (missing.length === 0) return [];

  const prefix = existing.length === 0 ? "" : existing.endsWith("\n") ? "" : "\n";
  const header = existing.includes("# NoEnv") ? "" : "# NoEnv (never commit secrets)\n";
  fs.appendFileSync(filePath, prefix + header + missing.join("\n") + "\n");
  return missing;
}
