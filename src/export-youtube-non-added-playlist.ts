import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { toCsv } from "./lib/csv";
import { findDuplicates, formatDuration } from "./lib/util";

type YoutubePlaylistEntry = {
  id?: string;
  title?: string;
  url?: string;
  channel?: string;
  uploader?: string;
  duration?: number | null;
};

type YoutubePlaylistSnapshot = {
  id?: string;
  title?: string;
  webpage_url?: string;
  entries?: Array<YoutubePlaylistEntry | null>;
};

type ExportedPlaylistItem = {
  index: number;
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  url: string;
};

const snapshot = JSON.parse(readFileSync("data/raw/youtube_non_added_playlist_latest.json", "utf8")) as YoutubePlaylistSnapshot;
const items = (snapshot.entries ?? [])
  .filter((entry): entry is YoutubePlaylistEntry => entry !== null)
  .map((entry, index): ExportedPlaylistItem => ({
    index: index + 1,
    videoId: entry.id ?? "",
    title: entry.title ?? "",
    channel: entry.channel ?? entry.uploader ?? "",
    durationSeconds: entry.duration ?? null,
    url: toYoutubeUrl(entry),
  }));

const unavailableItems = items.filter((item) =>
  item.videoId === "" || /\b(deleted|private|unavailable)\b/i.test(item.title),
);
const duplicateVideoIds = findDuplicates(items.map((item) => item.videoId).filter(Boolean));

mkdirSync("data/manual-review", { recursive: true });
mkdirSync("docs", { recursive: true });
writeFileSync("data/manual-review/youtube-non-added-playlist-current.json", `${JSON.stringify(items, null, 2)}\n`);
writeFileSync("data/manual-review/youtube-non-added-playlist-current.csv", toCsv(items, ["index", "videoId", "title", "channel", "durationSeconds", "url"]));
writeFileSync("docs/youtube-non-added-playlist-current.md", toMarkdown(items, unavailableItems, duplicateVideoIds));

console.log(`Playlist: ${snapshot.title ?? "(untitled)"} (${snapshot.id ?? "unknown"})`);
console.log(`Items: ${items.length}`);
console.log(`Unavailable-looking items: ${unavailableItems.length}`);
console.log(`Duplicate video IDs: ${duplicateVideoIds.length}`);
console.log("Wrote data/manual-review/youtube-non-added-playlist-current.json");
console.log("Wrote data/manual-review/youtube-non-added-playlist-current.csv");
console.log("Wrote docs/youtube-non-added-playlist-current.md");

function toMarkdown(
  playlistItems: ExportedPlaylistItem[],
  unavailable: ExportedPlaylistItem[],
  duplicateIds: string[],
): string {
  return [
    "# Current YouTube Non-Added Playlist",
    "",
    `Playlist: ${snapshot.title ?? "(untitled)"}`,
    `Playlist ID: ${snapshot.id ?? "unknown"}`,
    `Items: ${playlistItems.length}`,
    `Unavailable-looking items: ${unavailable.length}`,
    `Duplicate video IDs: ${duplicateIds.length}`,
    "",
    "## Unavailable-Looking Items",
    "",
    unavailable.length === 0 ? "None." : toList(unavailable),
    "",
    "## Items",
    "",
    toList(playlistItems),
    "",
  ].join("\n");
}

function toList(playlistItems: ExportedPlaylistItem[]): string {
  return playlistItems
    .map((item) =>
      [
        `${item.index}. ${item.title || item.videoId}`,
        `   - Video ID: ${item.videoId}`,
        `   - Channel: ${item.channel}`,
        `   - Duration: ${formatDuration(item.durationSeconds)}`,
        `   - URL: ${item.url}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function toYoutubeUrl(entry: YoutubePlaylistEntry): string {
  if (entry.url?.startsWith("http")) {
    return entry.url;
  }

  return entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : "";
}
