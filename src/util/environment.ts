/** Keep known provider bootstrap credentials out of application environments. */
export function applicationEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (/^(NOENV_PASSPHRASE|KNOX_USER_AUTH|KNOX_MACHINE_AUTH|KNOX_SERVICE_AUTH)$/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}
