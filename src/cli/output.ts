/**
 * Output helpers. Human-facing messages go to **stderr** so that machine output
 * (`noenv export`, `noenv get`) on **stdout** stays clean and pipeable.
 */

let verboseEnabled = false;

export function setVerbose(v: boolean): void {
  verboseEnabled = v;
}
export function isVerbose(): boolean {
  return verboseEnabled;
}

export const log = {
  info: (m: string): void => void process.stderr.write(m + "\n"),
  success: (m: string): void => void process.stderr.write(`✓ ${m}\n`),
  warn: (m: string): void => void process.stderr.write(`! ${m}\n`),
  error: (m: string): void => void process.stderr.write(`✗ ${m}\n`),
  verbose: (m: string): void => {
    if (verboseEnabled) process.stderr.write(`· ${m}\n`);
  },
  /** Machine output to stdout. */
  out: (m: string): void => void process.stdout.write(m + "\n"),
};

/** Never print real secret values by default. */
export function redact(_value: string): string {
  return "********";
}
