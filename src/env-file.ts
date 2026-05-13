import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function upsertEnvValue(envPath: string, name: string, value: string): void {
  const currentEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const escapedName = escapeRegExp(name);
  const assignment = `${name}=${value}`;
  const nextEnv = new RegExp(`^${escapedName}=.*$`, "m").test(currentEnv)
    ? currentEnv.replace(new RegExp(`^${escapedName}=.*$`, "m"), assignment)
    : `${currentEnv.trimEnd()}\n${assignment}\n`;

  writeFileSync(envPath, nextEnv);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
