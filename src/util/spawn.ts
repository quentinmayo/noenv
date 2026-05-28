import { spawn } from "node:child_process";

/**
 * Quote one argument for the platform shell.
 *
 * We deliberately pass a single, self-quoted command string to `spawn` with
 * `shell: true` rather than an args array. The args-array + shell:true form is
 * deprecated (DEP0190) precisely because Node does NOT escape the arguments —
 * a command-injection footgun. By quoting here we keep shell resolution (needed
 * on Windows for `.cmd` shims like npm/pnpm) without that risk.
 */
export function quoteArg(arg: string): string {
  if (process.platform === "win32") {
    // Wrap in double quotes (neutralizes & | < > ^ ( ) and spaces under cmd.exe);
    // double embedded quotes.
    if (arg === "" || /[\s"&|<>^()%!]/.test(arg)) {
      return '"' + arg.replace(/"/g, '""') + '"';
    }
    return arg;
  }
  // POSIX: single quotes are fully literal; close/escape/reopen embedded quotes.
  if (arg === "" || /[^A-Za-z0-9_@%+=:,./-]/.test(arg)) {
    return "'" + arg.replace(/'/g, `'\\''`) + "'";
  }
  return arg;
}

/**
 * Spawn the child command with the merged environment, inheriting stdio and
 * preserving the exit code.
 */
export function spawnChild(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  if (argv.length === 0) return Promise.resolve(1);
  const commandLine = argv.map(quoteArg).join(" ");
  return new Promise((resolve) => {
    const child = spawn(commandLine, { stdio: "inherit", env, shell: true });
    child.on("error", (err) => {
      process.stderr.write(`✗ failed to start "${argv[0]}": ${err.message}\n`);
      resolve(127);
    });
    child.on("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}
