import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { savedAccessToken } from "./lib/youtube-auth";
import { readManualProgress, readManualQueue, type ManualQueueItem } from "./lib/manual-review";
import { chunks, unique } from "./lib/util";

type PlaylistState = {
  playlistId: string;
  addedIndexes?: number[];
  skippedIndexes?: number[];
  skipReasons?: Record<string, string>;
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

const statePath = "data/manual-review/youtube-non-added-playlist-state.json";
const rawOutputPath = "data/raw/youtube_non_added_playlist_latest.json";
const reportOutputPath = "docs/youtube-non-added-playlist-refresh.md";
const reportJsonOutputPath = "reports/youtube-non-added-refresh/latest-vs-local.json";

const state = JSON.parse(readFileSync(statePath, "utf8")) as PlaylistState;
const progress = readManualProgress();
const queue = readManualQueue();
const nonAdded = progress.filter((item) => item.status !== "added").sort((left, right) => left.index - right.index);
const queueByIndex = new Map(queue.map((item) => [item.index, item]));
const nonAddedQueueItems = nonAdded.flatMap((item) => {
  const queueItem = queueByIndex.get(item.index);
  return queueItem ? [queueItem] : [];
});
const auth = await savedAccessToken();

if (!auth) {
  throw new Error("No usable Google token. Run bun run auth:youtube.");
}

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

async function fetchPlaylistItems(auth: string, playlistId: string): Promise<YoutubePlaylistItem[]> {
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

async function fetchVideos(auth: string, ids: string[]): Promise<YoutubeVideo[]> {
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

async function youtubeGet<T>(auth: string, path: string): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    headers: {
      Authorization: `Bearer ${auth}`,
    },
  });
  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube API failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }

  return responseBody as T;
}

function getPlaylistItemVideoId(item: YoutubePlaylistItem): string | null {
  return item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? null;
}

function toLocalReportItem(item: ManualQueueItem): ReportItem {
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
