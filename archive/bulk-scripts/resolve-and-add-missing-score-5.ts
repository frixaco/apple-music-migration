import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import confidenceReport from "../data/processed/youtube_apple_music_confidence.json" with { type: "json" };
import { AppleMusicClient, type AppleMusicCatalogResource, type AppleMusicPlaylist } from "./apple-music-client";

type ConfidenceReportItem = {
  index: number;
  confidenceScore: number;
  youtubeTitle: string;
  bestAppleId: string;
  bestAppleType: string;
  bestAppleName: string;
  bestAppleArtist: string;
  bestAppleAlbum: string;
  bestAppleDurationSeconds: number | null;
  bestAppleUrl: string;
};

type Resolution = {
  index: number;
  youtubeTitle: string;
  originalAppleId: string;
  originalAppleName: string;
  originalAppleArtist: string;
  status: "added" | "already_present" | "unresolved";
  resolvedAppleId: string;
  resolvedAppleName: string;
  resolvedAppleArtist: string;
  resolvedAppleAlbum: string;
  resolvedAppleDurationSeconds: number | null;
  resolvedAppleUrl: string;
  rawScore: number;
  notes: string[];
};

const targetPlaylistName = Bun.env.TARGET_PLAYLIST_NAME?.trim() || "YouTube + Favourite Songs";
const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "uz";
const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const musicUserToken = readRequiredEnv("APPLE_MUSIC_USER_TOKEN");
const client = new AppleMusicClient({ developerToken, musicUserToken });
const playlist = await findTargetPlaylist();
const existingCatalogIds = await getExistingCatalogIds(playlist.id);
const scoreFiveSongs = uniqueBy(
  (confidenceReport as ConfidenceReportItem[])
    .filter((item) => item.confidenceScore === 5 && item.bestAppleId && item.bestAppleType === "songs")
    .sort((left, right) => left.index - right.index),
  (item) => item.bestAppleId,
);
const missingSongs = scoreFiveSongs.filter((item) => !existingCatalogIds.has(item.bestAppleId));
const resolutions: Resolution[] = [];
const tracksToAdd: Array<{ id: string; type: string }> = [];

for (const item of missingSongs) {
  const candidate = await resolveUzCandidate(item);

  if (!candidate) {
    resolutions.push(toUnresolved(item));
    continue;
  }

  const attributes = candidate.resource.attributes ?? {};

  if (existingCatalogIds.has(candidate.resource.id)) {
    resolutions.push(toResolved(item, candidate, "already_present", "resolved Uzbekistan catalog ID already exists in playlist"));
    continue;
  }

  tracksToAdd.push({ id: candidate.resource.id, type: candidate.resource.type });
  existingCatalogIds.add(candidate.resource.id);
  resolutions.push(toResolved(item, candidate, "added", "resolved from original catalog ID to Uzbekistan storefront catalog ID"));
}

for (const chunk of chunks(tracksToAdd, 25)) {
  await client.addTracksToLibraryPlaylist(playlist.id, chunk);
}

mkdirSync("reports", { recursive: true });
writeFileSync("reports/score-5-uz-resolution-results.json", `${JSON.stringify(resolutions, null, 2)}\n`);
writeFileSync("reports/score-5-uz-resolution-results.csv", toCsv(resolutions));

console.log(`Missing score-5 song IDs checked: ${missingSongs.length}`);
console.log(`Resolved and queued: ${tracksToAdd.length}`);
console.log(`Unresolved: ${resolutions.filter((resolution) => resolution.status === "unresolved").length}`);
console.log("Wrote reports/score-5-uz-resolution-results.json");
console.log("Wrote reports/score-5-uz-resolution-results.csv");

async function findTargetPlaylist(): Promise<AppleMusicPlaylist> {
  const playlists = await client.getAllLibraryPlaylists();
  const target = playlists.find((candidate) => candidate.attributes?.name === targetPlaylistName);

  if (!target) {
    throw new Error(`Could not find target playlist "${targetPlaylistName}".`);
  }

  return target;
}

async function getExistingCatalogIds(playlistId: string): Promise<Set<string>> {
  const tracks = await client.getAllLibraryPlaylistTracks(playlistId);

  return new Set(tracks.flatMap((track) => {
    const catalogId = track.attributes?.playParams?.catalogId;
    return catalogId ? [catalogId] : [];
  }));
}

async function resolveUzCandidate(item: ConfidenceReportItem): Promise<ResolvedCandidate | null> {
  const queries = unique([
    `${item.bestAppleName} ${item.bestAppleArtist}`,
    `${item.bestAppleArtist} ${item.bestAppleName}`,
    item.youtubeTitle,
  ]);
  const candidates: AppleMusicCatalogResource[] = [];

  for (const query of queries) {
    const response = await client.searchCatalog({
      storefront,
      term: query,
      types: ["songs"],
      limit: 25,
    });

    candidates.push(...(response.results?.songs?.data ?? []));
    await sleep(100);
  }

  const scored = uniqueBy(candidates, (candidate) => candidate.id)
    .map((resource) => scoreCandidate(item, resource))
    .sort((left, right) => right.rawScore - left.rawScore);
  const best = scored[0];

  if (!best || best.rawScore < 0.82 || best.titleSimilarity < 0.82 || best.artistSimilarity < 0.45) {
    return null;
  }

  return best;
}

type ResolvedCandidate = {
  resource: AppleMusicCatalogResource;
  rawScore: number;
  titleSimilarity: number;
  artistSimilarity: number;
  durationScore: number;
};

function scoreCandidate(item: ConfidenceReportItem, resource: AppleMusicCatalogResource): ResolvedCandidate {
  const attributes = resource.attributes ?? {};
  const titleSimilarity = similarity(item.bestAppleName, attributes.name ?? "");
  const artistSimilarity = similarity(item.bestAppleArtist, attributes.artistName ?? "");
  const durationScore = scoreDuration(item.bestAppleDurationSeconds, attributes.durationInMillis ?? null);
  const rawScore = titleSimilarity * 0.48 + artistSimilarity * 0.34 + durationScore * 0.18;

  return {
    resource,
    rawScore,
    titleSimilarity,
    artistSimilarity,
    durationScore,
  };
}

function toResolved(
  item: ConfidenceReportItem,
  candidate: ResolvedCandidate,
  status: "added" | "already_present",
  note: string,
): Resolution {
  const attributes = candidate.resource.attributes ?? {};

  return {
    index: item.index,
    youtubeTitle: item.youtubeTitle,
    originalAppleId: item.bestAppleId,
    originalAppleName: item.bestAppleName,
    originalAppleArtist: item.bestAppleArtist,
    status,
    resolvedAppleId: candidate.resource.id,
    resolvedAppleName: attributes.name ?? "",
    resolvedAppleArtist: attributes.artistName ?? "",
    resolvedAppleAlbum: attributes.albumName ?? "",
    resolvedAppleDurationSeconds: attributes.durationInMillis ? Math.round(attributes.durationInMillis / 1000) : null,
    resolvedAppleUrl: attributes.url ?? "",
    rawScore: round(candidate.rawScore),
    notes: [note],
  };
}

function toUnresolved(item: ConfidenceReportItem): Resolution {
  return {
    index: item.index,
    youtubeTitle: item.youtubeTitle,
    originalAppleId: item.bestAppleId,
    originalAppleName: item.bestAppleName,
    originalAppleArtist: item.bestAppleArtist,
    status: "unresolved",
    resolvedAppleId: "",
    resolvedAppleName: "",
    resolvedAppleArtist: "",
    resolvedAppleAlbum: "",
    resolvedAppleDurationSeconds: null,
    resolvedAppleUrl: "",
    rawScore: 0,
    notes: ["could not find a strong equivalent in the Uzbekistan storefront"],
  };
}

function readRequiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.`);
  }

  return value;
}

function scoreDuration(expectedSeconds: number | null, actualMillis: number | null): number {
  if (!expectedSeconds || !actualMillis) {
    return 0.45;
  }

  const actualSeconds = Math.round(actualMillis / 1000);
  const difference = Math.abs(expectedSeconds - actualSeconds);

  if (difference <= 4) return 1;
  if (difference <= 8) return 0.92;
  if (difference <= 15) return 0.78;
  if (difference <= 30) return 0.56;
  if (difference <= 60) return 0.32;
  return 0.08;
}

function similarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const containment = intersection / Math.min(leftSet.size, rightSet.size);
  const jaccard = intersection / new Set([...leftSet, ...rightSet]).size;

  return Math.max(containment * 0.75 + jaccard * 0.25, normalize(left) === normalize(right) ? 1 : 0);
}

function tokens(value: string): string[] {
  return normalize(value).split(" ").filter((token) => token.length > 1);
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const itemKey = key(item);

    if (seen.has(itemKey)) {
      continue;
    }

    seen.add(itemKey);
    result.push(item);
  }

  return result;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toCsv(items: Resolution[]): string {
  const columns: Array<keyof Resolution> = [
    "index",
    "status",
    "youtubeTitle",
    "originalAppleName",
    "originalAppleArtist",
    "originalAppleId",
    "resolvedAppleName",
    "resolvedAppleArtist",
    "resolvedAppleAlbum",
    "resolvedAppleDurationSeconds",
    "resolvedAppleId",
    "resolvedAppleUrl",
    "rawScore",
    "notes",
  ];
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const stringValue = Array.isArray(value) ? value.join(" | ") : String(value ?? "");

  return `"${stringValue.replaceAll("\"", "\"\"")}"`;
}
