import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type QueueItem = {
  index: number;
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeUrl: string;
  youtubeChannel: string;
};

type YoutubePlaylistEntry = {
  id?: string;
  title?: string;
  url?: string;
  channel?: string;
  uploader?: string;
};

type YoutubePlaylistSnapshot = {
  id?: string;
  title?: string;
  entries?: Array<YoutubePlaylistEntry | null>;
};

type ComparisonItem = {
  latestIndex: number | null;
  localIndex: number | null;
  videoId: string;
  title: string;
  channel: string;
  url: string;
};

const localQueue = JSON.parse(readFileSync("data/manual-review/queue.json", "utf8")) as QueueItem[];
const latestSnapshot = JSON.parse(readFileSync("data/raw/youtube_playlist_raw_latest.json", "utf8")) as YoutubePlaylistSnapshot;
const latestEntries = (latestSnapshot.entries ?? []).filter((entry): entry is YoutubePlaylistEntry => entry !== null);
const localByVideoId = new Map(localQueue.map((item) => [item.youtubeVideoId, item]));
const latestByVideoId = new Map(latestEntries.flatMap((entry, index) => (entry.id ? [[entry.id, { entry, index }]] : [])));
const missingLocally = latestEntries
  .flatMap((entry, index): ComparisonItem[] => {
    if (!entry.id || localByVideoId.has(entry.id)) {
      return [];
    }

    return [
      {
        latestIndex: index + 1,
        localIndex: null,
        videoId: entry.id,
        title: entry.title ?? "",
        channel: entry.channel ?? entry.uploader ?? "",
        url: toYoutubeUrl(entry),
      },
    ];
  });
const removedFromYoutube = localQueue
  .flatMap((item): ComparisonItem[] => {
    if (latestByVideoId.has(item.youtubeVideoId)) {
      return [];
    }

    return [
      {
        latestIndex: null,
        localIndex: item.index,
        videoId: item.youtubeVideoId,
        title: item.youtubeTitle,
        channel: item.youtubeChannel,
        url: item.youtubeUrl,
      },
    ];
  });
const orderDifferences = latestEntries
  .flatMap((entry, index): ComparisonItem[] => {
    const localItem = entry.id ? localByVideoId.get(entry.id) : undefined;

    if (!entry.id || !localItem || localItem.index === index + 1) {
      return [];
    }

    return [
      {
        latestIndex: index + 1,
        localIndex: localItem.index,
        videoId: entry.id,
        title: entry.title ?? localItem.youtubeTitle,
        channel: entry.channel ?? entry.uploader ?? localItem.youtubeChannel,
        url: toYoutubeUrl(entry),
      },
    ];
  });

mkdirSync("reports/youtube-playlist-refresh", { recursive: true });
mkdirSync("docs", { recursive: true });
writeFileSync("reports/youtube-playlist-refresh/latest-vs-local.json", `${JSON.stringify({
  playlist: {
    id: latestSnapshot.id ?? "",
    title: latestSnapshot.title ?? "",
  },
  localCount: localQueue.length,
  latestCount: latestEntries.length,
  missingLocally,
  removedFromYoutube,
  orderDifferences,
}, null, 2)}\n`);
writeFileSync("reports/youtube-playlist-refresh/latest-vs-local.md", toMarkdown());
writeFileSync("docs/latest-youtube-playlist-refresh.md", toMarkdown());

console.log(`Playlist: ${latestSnapshot.title ?? "(untitled)"} (${latestSnapshot.id ?? "unknown"})`);
console.log(`Local queue: ${localQueue.length}`);
console.log(`Latest YouTube: ${latestEntries.length}`);
console.log(`Missing locally: ${missingLocally.length}`);
console.log(`Removed from YouTube: ${removedFromYoutube.length}`);
console.log(`Order differences: ${orderDifferences.length}`);
console.log("Wrote reports/youtube-playlist-refresh/latest-vs-local.md");
console.log("Wrote reports/youtube-playlist-refresh/latest-vs-local.json");
console.log("Wrote docs/latest-youtube-playlist-refresh.md");

function toMarkdown(): string {
  return [
    "# Latest YouTube Playlist vs Local Queue",
    "",
    `Playlist: ${latestSnapshot.title ?? "(untitled)"} (${latestSnapshot.id ?? "unknown"})`,
    `Local queue: ${localQueue.length}`,
    `Latest YouTube: ${latestEntries.length}`,
    `Missing locally: ${missingLocally.length}`,
    `Removed from YouTube: ${removedFromYoutube.length}`,
    `Order differences: ${orderDifferences.length}`,
    "",
    "## Missing Locally",
    "",
    toList(missingLocally),
    "",
    "## Removed From YouTube",
    "",
    toList(removedFromYoutube),
    "",
    "## Order Differences",
    "",
    toList(orderDifferences),
    "",
  ].join("\n");
}

function toList(items: ComparisonItem[]): string {
  if (items.length === 0) {
    return "None.";
  }

  return items.map((item) => [
    `- ${item.title || item.videoId}`,
    `  - Video ID: ${item.videoId}`,
    `  - Local index: ${item.localIndex ?? "(missing)"}`,
    `  - Latest index: ${item.latestIndex ?? "(missing)"}`,
    `  - Channel: ${item.channel}`,
    `  - URL: ${item.url}`,
  ].join("\n")).join("\n\n");
}

function toYoutubeUrl(entry: YoutubePlaylistEntry): string {
  if (entry.url?.startsWith("http")) {
    return entry.url;
  }

  return entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : "";
}
