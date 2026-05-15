import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

type GoogleOAuthClient = {
  installed?: {
    client_id?: string;
    client_secret?: string;
  };
};

type GoogleToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
};

type PlaylistState = {
  playlistId: string;
  addedIndexes?: number[];
  skippedIndexes?: number[];
  skipReasons?: Record<string, string>;
};

type ManualProgressItem = {
  index: number;
  status: string;
  youtubeTitle: string;
};

type QueueItem = {
  index: number;
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeUrl: string;
  youtubeChannel: string;
};

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: YoutubePlaylistItem[];
};

type YoutubePlaylistItem = {
  id: string;
  snippet?: {
    title?: string;
    position?: number;
    channelTitle?: string;
    resourceId?: {
      videoId?: string;
    };
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
  status?: {
    privacyStatus?: string;
  };
};

type VideosResponse = {
  items?: YoutubeVideo[];
};

type YoutubeVideo = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
  };
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
  };
};

type ReportItem = {
  index: number | null;
  videoId: string;
  title: string;
  channel: string;
  url: string;
};

const oauthClientPath = "secrets/google-oauth-client.json";
const tokenPath = "secrets/google-youtube-token.json";
const statePath = "data/manual-review/youtube-non-added-playlist-state.json";
const progressPath = "data/manual-review/progress.json";
const queuePath = "data/manual-review/queue.json";
const rawOutputPath = "data/raw/youtube_non_added_playlist_latest.json";
const reportOutputPath = "docs/youtube-non-added-playlist-refresh.md";
const reportJsonOutputPath = "reports/youtube-non-added-refresh/latest-vs-local.json";

const state = JSON.parse(readFileSync(statePath, "utf8")) as PlaylistState;
const progress = JSON.parse(readFileSync(progressPath, "utf8")) as ManualProgressItem[];
const queue = JSON.parse(readFileSync(queuePath, "utf8")) as QueueItem[];
const nonAdded = progress.filter((item) => item.status !== "added").sort((left, right) => left.index - right.index);
const queueByIndex = new Map(queue.map((item) => [item.index, item]));
const nonAddedQueueItems = nonAdded.flatMap((item) => {
  const queueItem = queueByIndex.get(item.index);
  return queueItem ? [queueItem] : [];
});
const auth = await getAuth();
const playlistItems = await fetchPlaylistItems(auth, state.playlistId);
const videoIds = unique(playlistItems.flatMap((item) => getPlaylistItemVideoId(item) ?? []));
const accessibleVideos = await fetchVideos(auth, videoIds);
const accessibleVideoIds = new Set(accessibleVideos.map((video) => video.id));
const localNonAddedVideoIds = new Set(nonAddedQueueItems.map((item) => item.youtubeVideoId));
const playlistVideoIds = new Set(videoIds);
const playlistByVideoId = new Map(playlistItems.flatMap((item) => {
  const videoId = getPlaylistItemVideoId(item);
  return videoId ? [[videoId, item]] : [];
}));
const missingFromPlaylist = nonAddedQueueItems
  .filter((item) => !playlistVideoIds.has(item.youtubeVideoId))
  .map((item) => toLocalReportItem(item));
const extraInPlaylist = videoIds
  .filter((videoId) => !localNonAddedVideoIds.has(videoId))
  .map((videoId) => toPlaylistReportItem(videoId, playlistByVideoId.get(videoId)));
const inaccessibleInPlaylist = videoIds
  .filter((videoId) => !accessibleVideoIds.has(videoId))
  .map((videoId) => toPlaylistReportItem(videoId, playlistByVideoId.get(videoId)));

mkdirSync("data/raw", { recursive: true });
mkdirSync("docs", { recursive: true });
mkdirSync("reports/youtube-non-added-refresh", { recursive: true });
writeFileSync(rawOutputPath, `${JSON.stringify({ playlistId: state.playlistId, playlistItems, videos: accessibleVideos }, null, 2)}\n`);
writeFileSync(reportJsonOutputPath, `${JSON.stringify({
  playlistId: state.playlistId,
  localNonAddedCount: nonAdded.length,
  livePlaylistItemCount: playlistItems.length,
  liveUniqueVideoCount: videoIds.length,
  inaccessibleInPlaylist,
  missingFromPlaylist,
  extraInPlaylist,
  skippedIndexesFromCreation: state.skippedIndexes ?? [],
  skipReasonsFromCreation: state.skipReasons ?? {},
}, null, 2)}\n`);
writeFileSync(reportOutputPath, toMarkdown());

console.log(`Playlist ID: ${state.playlistId}`);
console.log(`Local non-added items: ${nonAdded.length}`);
console.log(`Live playlist items: ${playlistItems.length}`);
console.log(`Live unique videos: ${videoIds.length}`);
console.log(`Unavailable/inaccessible live videos: ${inaccessibleInPlaylist.length}`);
console.log(`Local non-added missing from live playlist: ${missingFromPlaylist.length}`);
console.log(`Extra live playlist videos not in local non-added list: ${extraInPlaylist.length}`);
console.log(`Wrote ${rawOutputPath}`);
console.log(`Wrote ${reportOutputPath}`);

function toMarkdown(): string {
  return [
    "# YouTube Non-Added Playlist Refresh",
    "",
    `Playlist ID: ${state.playlistId}`,
    `Local non-added items: ${nonAdded.length}`,
    `Live playlist items: ${playlistItems.length}`,
    `Live unique videos: ${videoIds.length}`,
    `Unavailable/inaccessible live videos: ${inaccessibleInPlaylist.length}`,
    `Local non-added missing from live playlist: ${missingFromPlaylist.length}`,
    `Extra live playlist videos not in local non-added list: ${extraInPlaylist.length}`,
    "",
    "## Unavailable Or Inaccessible In Live Playlist",
    "",
    toList(inaccessibleInPlaylist),
    "",
    "## Local Non-Added Missing From Live Playlist",
    "",
    toList(missingFromPlaylist),
    "",
    "## Extra Live Playlist Videos",
    "",
    toList(extraInPlaylist),
    "",
    "## Skipped During Original Creation",
    "",
    toSkippedList(),
    "",
  ].join("\n");
}

async function fetchPlaylistItems(auth: GoogleToken, playlistId: string): Promise<YoutubePlaylistItem[]> {
  const items: YoutubePlaylistItem[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,status",
      maxResults: "50",
      playlistId,
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await youtubeGet<PlaylistItemsResponse>(auth, `/playlistItems?${params}`);
    items.push(...(response.items ?? []));
    pageToken = response.nextPageToken ?? null;
  } while (pageToken);

  return items.sort((left, right) => (left.snippet?.position ?? 0) - (right.snippet?.position ?? 0));
}

async function fetchVideos(auth: GoogleToken, ids: string[]): Promise<YoutubeVideo[]> {
  const videos: YoutubeVideo[] = [];

  for (const chunk of chunks(ids, 50)) {
    const params = new URLSearchParams({
      part: "snippet,status",
      id: chunk.join(","),
      maxResults: "50",
    });
    const response = await youtubeGet<VideosResponse>(auth, `/videos?${params}`);
    videos.push(...(response.items ?? []));
  }

  return videos;
}

async function youtubeGet<T>(auth: GoogleToken, path: string): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
    },
  });
  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube API failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }

  return responseBody as T;
}

async function getAuth(): Promise<GoogleToken> {
  const token = JSON.parse(readFileSync(tokenPath, "utf8")) as GoogleToken;

  if ((token.expires_at ?? 0) > Date.now() + 60_000) {
    return token;
  }

  if (!token.refresh_token) {
    throw new Error("Google token is expired and has no refresh_token.");
  }

  const client = JSON.parse(readFileSync(oauthClientPath, "utf8")) as GoogleOAuthClient;
  const clientId = client.installed?.client_id;
  const clientSecret = client.installed?.client_secret;

  if (!clientId || !clientSecret) {
    throw new Error(`Expected OAuth client credentials in ${oauthClientPath}.`);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const responseBody = (await response.json()) as GoogleToken;

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }

  const refreshedToken = {
    ...token,
    ...responseBody,
    expires_at: Date.now() + (responseBody.expires_in ?? 3600) * 1000,
  };
  writeFileSync(tokenPath, `${JSON.stringify(refreshedToken, null, 2)}\n`, { mode: 0o600 });
  return refreshedToken;
}

function getPlaylistItemVideoId(item: YoutubePlaylistItem): string | null {
  return item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? null;
}

function toLocalReportItem(item: QueueItem): ReportItem {
  return {
    index: item.index,
    videoId: item.youtubeVideoId,
    title: item.youtubeTitle,
    channel: item.youtubeChannel,
    url: item.youtubeUrl,
  };
}

function toPlaylistReportItem(videoId: string, item: YoutubePlaylistItem | undefined): ReportItem {
  return {
    index: item?.snippet?.position === undefined ? null : item.snippet.position + 1,
    videoId,
    title: item?.snippet?.title ?? "",
    channel: item?.snippet?.channelTitle ?? "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function toList(items: ReportItem[]): string {
  if (items.length === 0) {
    return "None.";
  }

  return items.map((item) => [
    `- ${item.title || item.videoId}`,
    `  - Index: ${item.index ?? "(unknown)"}`,
    `  - Video ID: ${item.videoId}`,
    `  - Channel: ${item.channel}`,
    `  - URL: ${item.url}`,
  ].join("\n")).join("\n\n");
}

function toSkippedList(): string {
  const skippedIndexes = state.skippedIndexes ?? [];

  if (skippedIndexes.length === 0) {
    return "None.";
  }

  return skippedIndexes.map((index) => {
    const queueItem = queueByIndex.get(index);
    return [
      `- ${queueItem?.youtubeTitle ?? index}`,
      `  - Local index: ${index}`,
      `  - Video ID: ${queueItem?.youtubeVideoId ?? ""}`,
      `  - URL: ${queueItem?.youtubeUrl ?? ""}`,
      `  - Original reason: ${state.skipReasons?.[String(index)] ?? ""}`,
    ].join("\n");
  }).join("\n\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}
