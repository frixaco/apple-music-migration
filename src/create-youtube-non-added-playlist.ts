import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { ManualProgressItem } from "./manual-progress.ts";

async function main(): Promise<void> {
  const progress = JSON.parse(readFileSync("data/manual-review/progress.json", "utf8")) as ManualProgressItem[];
  const queue = JSON.parse(readFileSync("data/manual-review/queue.json", "utf8")) as QueueItem[];
  const queueByIndex = new Map(queue.map((item) => [item.index, item]));
  const nonAddedItems = progress
    .filter((item) => item.status !== "added")
    .map((item) => toNonAddedVideo(item, queueByIndex.get(item.index)))
    .filter((item) => item.videoId !== "")
    .sort((left, right) => left.index - right.index);

  const auth = await getYoutubeAuth();
  const state = readState();
  const playlistId = state.playlistId ?? (await createPlaylist(auth, nonAddedItems.length));
  writeState({ ...state, playlistId });

  const currentState = readState();
  for (const item of nonAddedItems) {
    if (currentState.addedIndexes.includes(item.index) || currentState.skippedIndexes.includes(item.index)) {
      continue;
    }

    console.log(`#${item.index}: adding ${item.youtubeTitle}`);
    const addResult = await tryInsertPlaylistItem(auth, playlistId, item.videoId);
    if (addResult.ok) {
      currentState.addedIndexes.push(item.index);
      currentState.addedIndexes.sort((left, right) => left - right);
    } else {
      currentState.skippedIndexes.push(item.index);
      currentState.skippedIndexes.sort((left, right) => left - right);
      currentState.skipReasons[item.index] = addResult.reason;
      console.log(`#${item.index}: skipped (${addResult.reason})`);
    }
    currentState.lastUpdatedAt = new Date().toISOString();
    writeState(currentState);
  }

  console.log(`Done. Playlist: https://www.youtube.com/playlist?list=${playlistId}`);
  console.log(`Added videos recorded in state: ${currentState.addedIndexes.length}/${nonAddedItems.length}`);
  console.log(`Skipped videos recorded in state: ${currentState.skippedIndexes.length}/${nonAddedItems.length}`);
}

type QueueItem = {
  index: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeTitle: string;
};

type NonAddedVideo = {
  index: number;
  youtubeTitle: string;
  videoId: string;
};

type YoutubeAuth = {
  accessToken: string;
};

type GoogleOAuthClient = {
  installed?: {
    client_id?: string;
    client_secret?: string;
    auth_uri?: string;
  };
};

type YoutubePlaylistState = {
  playlistId: string | null;
  addedIndexes: number[];
  skippedIndexes: number[];
  skipReasons: Record<string, string>;
  lastUpdatedAt: string | null;
};

type GoogleToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

const oauthClientPath = "secrets/google-oauth-client.json";
const tokenPath = "secrets/google-youtube-token.json";
const statePath = "data/manual-review/youtube-non-added-playlist-state.json";
const youtubeScope = "https://www.googleapis.com/auth/youtube";
const redirectUri = "http://localhost";

void main();

async function getYoutubeAuth(): Promise<YoutubeAuth> {
  const client = readOAuthClient();
  const token = existsSync(tokenPath) ? (JSON.parse(readFileSync(tokenPath, "utf8")) as GoogleToken) : null;
  const validToken = token?.access_token !== undefined && (token.expires_at ?? 0) > Date.now() + 60_000;

  if (validToken) {
    return { accessToken: token.access_token };
  }

  if (token?.refresh_token !== undefined) {
    const refreshedToken = await refreshAccessToken(client, token.refresh_token);
    writeToken({ ...token, ...refreshedToken });
    return { accessToken: refreshedToken.access_token };
  }

  const authCode = readAuthCodeArg();

  if (authCode === null) {
    printAuthInstructions(client);
    process.exit(0);
  }

  const newToken = await exchangeAuthCode(client, authCode);
  writeToken(newToken);
  return { accessToken: newToken.access_token };
}

async function createPlaylist(auth: YoutubeAuth, itemCount: number): Promise<string> {
  const response = await youtubeFetch<YoutubePlaylistResponse>(
    auth,
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method: "POST",
      body: JSON.stringify({
        snippet: {
          title: "Apple Music Migration - Non-Added Review",
          description: `Non-added YouTube items from the Apple Music migration review. Items: ${itemCount}.`,
        },
        status: {
          privacyStatus: "private",
        },
      }),
    },
  );

  console.log(`Created playlist: https://www.youtube.com/playlist?list=${response.id}`);
  return response.id;
}

async function insertPlaylistItem(auth: YoutubeAuth, playlistId: string, videoId: string): Promise<void> {
  await youtubeFetch<unknown>(auth, "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
    method: "POST",
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: {
          kind: "youtube#video",
          videoId,
        },
      },
    }),
  });
}

async function tryInsertPlaylistItem(
  auth: YoutubeAuth,
  playlistId: string,
  videoId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await insertPlaylistItem(auth, playlistId, videoId);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("quotaExceeded")) {
      throw error;
    }

    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

type YoutubePlaylistResponse = {
  id: string;
};

async function youtubeFetch<T>(auth: YoutubeAuth, url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json()) as T | GoogleApiError;

  if (!response.ok) {
    throw new Error(`YouTube API failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body as T;
}

type GoogleApiError = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

async function exchangeAuthCode(client: RequiredGoogleOAuthClient, code: string): Promise<GoogleToken> {
  return withExpiry(
    await fetchForm<GoogleToken>("https://oauth2.googleapis.com/token", {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
}

function printAuthInstructions(client: RequiredGoogleOAuthClient): void {
  const authUrl = new URL(client.authUri);
  authUrl.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: youtubeScope,
    access_type: "offline",
    prompt: "consent",
  }).toString();

  console.log("Open this Google auth URL:");
  console.log(authUrl.toString());
  console.log("");
  console.log("After approving, copy the `code` value from the browser address bar.");
  console.log("Then run:");
  console.log("bun run youtube:create-non-added-playlist -- --code '<code-or-full-redirect-url>'");
}

type RequiredGoogleOAuthClient = {
  clientId: string;
  clientSecret: string;
  authUri: string;
};

function readOAuthClient(): RequiredGoogleOAuthClient {
  const client = JSON.parse(readFileSync(oauthClientPath, "utf8")) as GoogleOAuthClient;
  const installed = client.installed;
  const clientId = installed?.client_id;
  const clientSecret = installed?.client_secret;
  const authUri = installed?.auth_uri ?? "https://accounts.google.com/o/oauth2/auth";

  if (clientId === undefined || clientSecret === undefined) {
    throw new Error(`Expected an installed-app OAuth client JSON at ${oauthClientPath}.`);
  }

  return { clientId, clientSecret, authUri };
}

function readState(): YoutubePlaylistState {
  if (!existsSync(statePath)) {
    return { playlistId: null, addedIndexes: [], skippedIndexes: [], skipReasons: {}, lastUpdatedAt: null };
  }

  const state = JSON.parse(readFileSync(statePath, "utf8")) as Partial<YoutubePlaylistState>;
  return {
    playlistId: state.playlistId ?? null,
    addedIndexes: state.addedIndexes ?? [],
    skippedIndexes: state.skippedIndexes ?? [],
    skipReasons: state.skipReasons ?? {},
    lastUpdatedAt: state.lastUpdatedAt ?? null,
  };
}

function writeState(state: YoutubePlaylistState): void {
  mkdirSync("data/manual-review", { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function writeToken(token: GoogleToken): void {
  mkdirSync("secrets", { recursive: true });
  writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
}

function withExpiry(token: GoogleToken): GoogleToken {
  return {
    ...token,
    expires_at: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
}

function toNonAddedVideo(progressItem: ManualProgressItem, queueItem: QueueItem | undefined): NonAddedVideo {
  return {
    index: progressItem.index,
    youtubeTitle: progressItem.youtubeTitle,
    videoId: queueItem?.youtubeVideoId ?? "",
  };
}

function readAuthCodeArg(): string | null {
  const codeArgIndex = Bun.argv.indexOf("--code");
  const rawCode = codeArgIndex === -1 ? null : Bun.argv[codeArgIndex + 1];

  if (rawCode === null || rawCode === undefined || rawCode.trim() === "") {
    return null;
  }

  return extractAuthCode(rawCode);
}

function extractAuthCode(value: string): string {
  try {
    const url = new URL(value);
    return url.searchParams.get("code") ?? value;
  } catch {
    return value;
  }
}

async function refreshAccessToken(client: RequiredGoogleOAuthClient, refreshToken: string): Promise<GoogleToken> {
  return withExpiry(
    await fetchForm<GoogleToken>("https://oauth2.googleapis.com/token", {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );
}

async function fetchForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const responseBody = (await response.json()) as T | GoogleApiError;

  if (!response.ok) {
    throw new Error(`Google API failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }

  return responseBody as T;
}
