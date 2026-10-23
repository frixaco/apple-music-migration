import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readManualProgress, readManualQueue, type ManualProgressItem, type ManualQueueItem } from "./lib/manual-review";
import { exchangeAuthCode, readOAuthClient, savedAccessToken, writeToken, youtubeAuthUrl, type GoogleOAuthClient } from "./lib/youtube-auth";

async function main(): Promise<void> {
  const progress = readManualProgress();
  const queue = readManualQueue();
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

type NonAddedVideo = {
  index: number;
  youtubeTitle: string;
  videoId: string;
};

type YoutubeAuth = {
  accessToken: string;
};

type YoutubePlaylistState = {
  playlistId: string | null;
  addedIndexes: number[];
  skippedIndexes: number[];
  skipReasons: Record<string, string>;
  lastUpdatedAt: string | null;
};

const statePath = "data/manual-review/youtube-non-added-playlist-state.json";
const redirectUri = "http://localhost";

void main();

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

function toNonAddedVideo(progressItem: ManualProgressItem, queueItem: ManualQueueItem | undefined): NonAddedVideo {
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

async function getYoutubeAuth(): Promise<YoutubeAuth> {
  const accessToken = await savedAccessToken();

  if (accessToken) {
    return { accessToken };
  }

  const client = readOAuthClient();
  const authCode = readAuthCodeArg();

  if (authCode === null) {
    printAuthInstructions(client);
    process.exit(0);
  }

  const newToken = await exchangeAuthCode(client, authCode, redirectUri);
  writeToken(newToken);
  return { accessToken: newToken.access_token };
}

function printAuthInstructions(client: GoogleOAuthClient): void {
  console.log("Open this Google auth URL:");
  console.log(youtubeAuthUrl(client, redirectUri).toString());
  console.log("");
  console.log("After approving, copy the `code` value from the browser address bar.");
  console.log("Then run:");
  console.log("bun run youtube:create-non-added-playlist -- --code '<code-or-full-redirect-url>'");
}
