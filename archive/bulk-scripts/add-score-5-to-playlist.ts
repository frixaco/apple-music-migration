import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import confidenceReport from "../data/processed/youtube_apple_music_confidence.json" with { type: "json" };
import { AppleMusicClient, type AppleMusicPlaylist } from "./apple-music-client";

type ConfidenceReportItem = {
  index: number;
  confidenceScore: number;
  youtubeTitle: string;
  bestAppleId: string;
  bestAppleType: string;
  bestAppleName: string;
  bestAppleArtist: string;
};

type AddResult = {
  index: number;
  youtubeTitle: string;
  appleId: string;
  appleType: string;
  appleName: string;
  appleArtist: string;
  status: "added" | "skipped";
  reason: string;
};

const targetPlaylistName = Bun.env.TARGET_PLAYLIST_NAME?.trim() || "YouTube + Favourite Songs";
const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const musicUserToken = readRequiredEnv("APPLE_MUSIC_USER_TOKEN");
const client = new AppleMusicClient({ developerToken, musicUserToken });
const playlist = await findTargetPlaylist();
const existingTracks = await client.getAllLibraryPlaylistTracks(playlist.id);
const existingCatalogIds = new Set(existingTracks.flatMap((track) => {
  const catalogId = track.attributes?.playParams?.catalogId;
  return catalogId ? [catalogId] : [];
}));
const scoreFiveItems = (confidenceReport as ConfidenceReportItem[])
  .filter((item) => item.confidenceScore === 5 && item.bestAppleId && item.bestAppleType)
  .sort((left, right) => left.index - right.index);
const seenCatalogIds = new Set<string>();
const tracksToAdd: Array<{ id: string; type: string }> = [];
const results: AddResult[] = [];

for (const item of scoreFiveItems) {
  if (seenCatalogIds.has(item.bestAppleId)) {
    results.push(toResult(item, "skipped", "duplicate score-5 Apple catalog ID in YouTube matches"));
    continue;
  }

  seenCatalogIds.add(item.bestAppleId);

  if (existingCatalogIds.has(item.bestAppleId)) {
    results.push(toResult(item, "skipped", "already present in target playlist"));
    continue;
  }

  tracksToAdd.push({
    id: item.bestAppleId,
    type: item.bestAppleType,
  });
  results.push(toResult(item, "added", "queued for Apple Music playlist append"));
}

for (const chunk of chunks(tracksToAdd, 100)) {
  await client.addTracksToLibraryPlaylist(playlist.id, chunk);
}

const updatedTracks = await client.getAllLibraryPlaylistTracks(playlist.id);
mkdirSync("reports", { recursive: true });
writeFileSync("reports/score-5-add-results.json", `${JSON.stringify(results, null, 2)}\n`);
writeFileSync("reports/score-5-add-results.csv", toCsv(results));

console.log(`Playlist: ${playlist.attributes?.name ?? targetPlaylistName}`);
console.log(`Playlist ID: ${playlist.id}`);
console.log(`Before songs/items: ${existingTracks.length}`);
console.log(`Score-5 report rows: ${scoreFiveItems.length}`);
console.log(`Queued unique new Apple catalog items: ${tracksToAdd.length}`);
console.log(`Skipped: ${results.filter((result) => result.status === "skipped").length}`);
console.log(`After songs/items: ${updatedTracks.length}`);
console.log("Wrote reports/score-5-add-results.json");
console.log("Wrote reports/score-5-add-results.csv");

async function findTargetPlaylist(): Promise<AppleMusicPlaylist> {
  const playlists = await client.getAllLibraryPlaylists();
  const target = playlists.find((candidate) => candidate.attributes?.name === targetPlaylistName);

  if (!target) {
    throw new Error(`Could not find target playlist "${targetPlaylistName}".`);
  }

  if (target.attributes?.canEdit === false) {
    throw new Error(`Target playlist "${targetPlaylistName}" is not editable.`);
  }

  return target;
}

function readRequiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.`);
  }

  return value;
}

function toResult(item: ConfidenceReportItem, status: AddResult["status"], reason: string): AddResult {
  return {
    index: item.index,
    youtubeTitle: item.youtubeTitle,
    appleId: item.bestAppleId,
    appleType: item.bestAppleType,
    appleName: item.bestAppleName,
    appleArtist: item.bestAppleArtist,
    status,
    reason,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function toCsv(items: AddResult[]): string {
  const columns: Array<keyof AddResult> = [
    "index",
    "status",
    "reason",
    "youtubeTitle",
    "appleName",
    "appleArtist",
    "appleType",
    "appleId",
  ];
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}
