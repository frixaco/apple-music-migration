import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type GoogleToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

export type GoogleOAuthClient = {
  clientId: string;
  clientSecret: string;
  authUri: string;
};

export const oauthClientPath = "secrets/google-oauth-client.json";
export const tokenPath = "secrets/google-youtube-token.json";
export const youtubeScope = "https://www.googleapis.com/auth/youtube";

export function readOAuthClient(): GoogleOAuthClient {
  const { installed } = JSON.parse(readFileSync(oauthClientPath, "utf8")) as {
    installed?: { client_id?: string; client_secret?: string; auth_uri?: string };
  };

  if (!installed?.client_id || !installed.client_secret) {
    throw new Error(`Expected an installed-app OAuth client JSON at ${oauthClientPath}.`);
  }

  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    authUri: installed.auth_uri ?? "https://accounts.google.com/o/oauth2/auth",
  };
}

export function youtubeAuthUrl(client: GoogleOAuthClient, redirectUri: string, state?: string): URL {
  const url = new URL(client.authUri);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: youtubeScope,
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  }).toString();

  return url;
}

export async function exchangeAuthCode(client: GoogleOAuthClient, code: string, redirectUri: string): Promise<GoogleToken> {
  return requestToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export function writeToken(token: GoogleToken): void {
  mkdirSync("secrets", { recursive: true });
  writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Returns an access token from the saved token file, refreshing and saving it when it is about
 * to expire. Returns null when there is no saved token that can be used or refreshed.
 */
export async function savedAccessToken(): Promise<string | null> {
  const token = existsSync(tokenPath) ? (JSON.parse(readFileSync(tokenPath, "utf8")) as GoogleToken) : null;

  if (token?.access_token && (token.expires_at ?? 0) > Date.now() + 60_000) {
    return token.access_token;
  }

  if (!token?.refresh_token) {
    return null;
  }

  const client = readOAuthClient();
  const refreshedToken = await requestToken({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  });
  writeToken({ ...token, ...refreshedToken });

  return refreshedToken.access_token;
}

async function requestToken(body: Record<string, string>): Promise<GoogleToken> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const responseBody = (await response.json()) as GoogleToken;

  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }

  return { ...responseBody, expires_at: Date.now() + (responseBody.expires_in ?? 3600) * 1000 };
}
