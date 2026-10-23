import rawPlaylist from "../data/raw/youtube_playlist_raw.json" with { type: "json" };
import { findDuplicates } from "./lib/util";

const expectedVideoCount = 703;

type PlaylistEntry = {
  id?: string;
  title?: string;
  url?: string;
};

type PlaylistManifest = {
  id?: string;
  title?: string;
  entries?: Array<PlaylistEntry | null>;
};

const playlist = rawPlaylist as PlaylistManifest;
const entries = playlist.entries ?? [];
const emptyEntries = entries.filter((entry) => entry === null).length;
const videoIds = entries.flatMap((entry) => (entry?.id ? [entry.id] : []));
const duplicateVideoIds = findDuplicates(videoIds);

if (entries.length !== expectedVideoCount) {
  throw new Error(`Expected ${expectedVideoCount} playlist entries, found ${entries.length}.`);
}

if (emptyEntries > 0) {
  throw new Error(`Expected no empty playlist entries, found ${emptyEntries}.`);
}

if (duplicateVideoIds.length > 0) {
  throw new Error(`Found duplicate video IDs: ${duplicateVideoIds.join(", ")}`);
}

const first = entries[0];
const last = entries.at(-1);

console.log(`Playlist: ${playlist.title ?? "(untitled)"} (${playlist.id ?? "unknown id"})`);
console.log(`Entries: ${entries.length}`);
console.log(`Empty entries: ${emptyEntries}`);
console.log(`Duplicate video IDs: ${duplicateVideoIds.length}`);
console.log(`First: ${first?.title ?? "(missing title)"} | ${first?.url ?? first?.id ?? "(missing url)"}`);
console.log(`Last: ${last?.title ?? "(missing title)"} | ${last?.url ?? last?.id ?? "(missing url)"}`);
