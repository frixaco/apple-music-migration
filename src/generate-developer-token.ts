import { loadDeveloperTokenConfig, generateDeveloperToken } from "./apple-music-developer-token";
import { upsertEnvValue } from "./env-file";

const writeEnv = Bun.argv.includes("--write-env");
const config = loadDeveloperTokenConfig();
const generated = generateDeveloperToken(config);

console.log(`Generated Apple Music developer token for ${config.mediaId}.`);
console.log(`Expires: ${generated.expiresAt.toISOString()}`);

if (writeEnv) {
  writeTokenToEnv(generated.token);
  console.log("Updated APPLE_MUSIC_DEVELOPER_TOKEN in .env.");
} else {
  console.log("Run with --write-env to save it into .env.");
}

function writeTokenToEnv(token: string): void {
  upsertEnvValue(".env", "APPLE_MUSIC_DEVELOPER_TOKEN", token);
}
