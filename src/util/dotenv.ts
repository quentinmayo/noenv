/** Minimal, dependency-free dotenv parse/serialize. */

export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2] ?? "";
    const quoted =
      (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
    if (quoted && val.length >= 2) {
      const quote = val[0];
      val = val.slice(1, -1);
      if (quote === '"') {
        val = val
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"');
      }
    } else {
      const inlineComment = val.indexOf(" #");
      if (inlineComment >= 0) val = val.slice(0, inlineComment).trim();
    }
    out[key] = val;
  }
  return out;
}

function formatValue(v: string): string {
  if (v === "" || /[\s#"'\\]/.test(v)) return JSON.stringify(v);
  return v;
}

export function toDotenv(vars: Record<string, string>): string {
  return (
    Object.entries(vars)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join("\n") + "\n"
  );
}

export function toShell(vars: Record<string, string>): string {
  return (
    Object.entries(vars)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n"
  );
}
