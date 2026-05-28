import readline from "node:readline";

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Plain line prompt. */
export function question(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Yes/no confirmation. */
export async function confirm(query: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  const answer = (await question(query + suffix)).toLowerCase();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}

/** Masked password prompt. Falls back to a plain read when not a TTY. */
export function password(query: string): Promise<string> {
  if (!isTTY()) return question(query);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // Suppress echo of typed characters once the prompt has been shown.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rl as any)._writeToOutput = (str: string): void => {
      if (!muted) process.stdout.write(str);
    };
    process.stdout.write(query);
    muted = true;
    rl.question("", (answer) => {
      muted = false;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/** Single-choice menu. Returns the chosen index. Falls back to `defaultIndex` when not a TTY. */
export async function select(
  query: string,
  choices: string[],
  defaultIndex = 0,
): Promise<number> {
  if (!isTTY()) return defaultIndex;
  process.stderr.write(query + "\n");
  choices.forEach((c, i) => process.stderr.write(`  ${i + 1}. ${c}\n`));
  const answer = await question(`Choose [1-${choices.length}] (${defaultIndex + 1}): `);
  if (answer === "") return defaultIndex;
  const n = Number.parseInt(answer, 10);
  if (Number.isNaN(n) || n < 1 || n > choices.length) return defaultIndex;
  return n - 1;
}
