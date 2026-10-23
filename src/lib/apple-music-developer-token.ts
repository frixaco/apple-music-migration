import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sign } from "node:crypto";
import { readRequiredEnv } from "./env";

export type AppleMusicDeveloperTokenConfig = {
  teamId: string;
  keyId: string;
  mediaId: string;
  /** PEM contents of the MusicKit .p8 key. */
  privateKey: string;
};

export type GeneratedDeveloperToken = {
  token: string;
  expiresAt: Date;
};

const defaultTokenTtlSeconds = 60 * 60 * 24 * 30;

export function loadDeveloperTokenConfig(): AppleMusicDeveloperTokenConfig {
  return {
    teamId: readRequiredEnv("APPLE_TEAM_ID"),
    keyId: readRequiredEnv("APPLE_KEY_ID"),
    mediaId: readRequiredEnv("APPLE_MEDIA_ID"),
    privateKey: readPrivateKey(),
  };
}

/** Reads the key from APPLE_PRIVATE_KEY (hosted), or from the file at APPLE_PRIVATE_KEY_PATH (local). */
function readPrivateKey(): string {
  const inline = process.env.APPLE_PRIVATE_KEY?.trim();

  if (inline) {
    // Hosting dashboards often store multi-line values with escaped newlines.
    return inline.replace(/\\n/g, "\n");
  }

  return readFileSync(resolve(readRequiredEnv("APPLE_PRIVATE_KEY_PATH")), "utf8");
}

export function generateDeveloperToken(
  config: AppleMusicDeveloperTokenConfig,
  ttlSeconds = defaultTokenTtlSeconds,
): GeneratedDeveloperToken {
  validateDeveloperTokenConfig(config);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + ttlSeconds;
  const header = { alg: "ES256", kid: config.keyId };
  const payload = {
    iss: config.teamId,
    iat: nowSeconds,
    exp: expiresAtSeconds,
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return {
    token: `${signingInput}.${base64Url(signature)}`,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
}

export function validateDeveloperTokenConfig(config: AppleMusicDeveloperTokenConfig): void {
  validateAppleIdentifier("APPLE_TEAM_ID", config.teamId);
  validateAppleIdentifier("APPLE_KEY_ID", config.keyId);

  if (!config.mediaId.trim()) {
    throw new Error("APPLE_MEDIA_ID is required.");
  }

  if (!config.privateKey.includes("PRIVATE KEY")) {
    throw new Error("APPLE_PRIVATE_KEY (or the file at APPLE_PRIVATE_KEY_PATH) must be a PEM private key.");
  }
}

function validateAppleIdentifier(name: string, value: string): void {
  if (!/^[A-Z0-9]{10}$/.test(value)) {
    throw new Error(`${name} should be a 10-character Apple identifier.`);
  }
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}
