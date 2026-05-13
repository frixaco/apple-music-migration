import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AppleMusicClient, type AppleMusicCatalogResource } from "./apple-music-client";

type ManualQueueItem = {
  index: number;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  priorBestAppleName: string;
  priorBestAppleArtist: string;
};

type SearchResult = {
  id: string;
  type: string;
  name: string;
  artist: string;
  album: string;
  durationSeconds: number | null;
  url: string;
  titleScore: number;
  artistScore: number;
  durationScore: number;
  rawScore: number;
};

const indexArg = readFlag("--index");
const manualQuery = readFlag("--query");

if (!indexArg) {
  throw new Error("Usage: bun run manual:search -- --index <youtube index> [--query \"artist title\"]");
}

const targetIndex = Number(indexArg);

if (!Number.isInteger(targetIndex)) {
  throw new Error("--index must be an integer.");
}

const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const musicUserToken = readRequiredEnv("APPLE_MUSIC_USER_TOKEN");
const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "uz";
const queue = JSON.parse(readFileSync("data/manual-review/queue.json", "utf8")) as ManualQueueItem[];
const item = queue.find((candidate) => candidate.index === targetIndex);

if (!item) {
  throw new Error(`Could not find queue item ${targetIndex}. Run bun run manual:init first.`);
}

const client = new AppleMusicClient({ developerToken, musicUserToken });
const queries = buildQueries(item, manualQuery);
const resources: AppleMusicCatalogResource[] = [];

for (const query of queries) {
  const response = await client.searchCatalog({
    storefront,
    term: query,
    types: ["songs"],
    limit: 25,
  });

  resources.push(...(response.results?.songs?.data ?? []));
}

const results = dedupe(resources)
  .map((resource) => scoreResource(item, resource))
  .sort((left, right) => right.rawScore - left.rawScore);
const snapshot = {
  index: item.index,
  youtubeTitle: item.youtubeTitle,
  youtubeChannel: item.youtubeChannel,
  youtubeDurationSeconds: item.youtubeDurationSeconds,
  storefront,
  queries,
  results,
};

mkdirSync("reports/manual-review/searches", { recursive: true });
writeFileSync(`reports/manual-review/searches/${item.index}.json`, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`YouTube #${item.index}: ${item.youtubeTitle}`);
console.log(`Channel: ${item.youtubeChannel}`);
console.log(`Duration: ${item.youtubeDurationSeconds ?? "unknown"}s`);
console.log(`Queries: ${queries.join(" | ")}`);
console.log("");

for (const result of results.slice(0, 10)) {
  console.log([
    result.rawScore.toFixed(3),
    result.id,
    result.name,
    result.artist,
    result.album,
    `${result.durationSeconds ?? "?"}s`,
    result.url,
  ].join("\t"));
}

function buildQueries(item: ManualQueueItem, query: string | null): string[] {
  if (query) {
    return [query];
  }

  return unique([
    item.youtubeTitle,
    `${item.priorBestAppleName} ${item.priorBestAppleArtist}`,
    `${item.priorBestAppleArtist} ${item.priorBestAppleName}`,
    `${item.youtubeChannel} ${item.youtubeTitle}`,
    stripNoise(item.youtubeTitle),
  ].filter((value) => value.trim().length > 0));
}

function scoreResource(item: ManualQueueItem, resource: AppleMusicCatalogResource): SearchResult {
  const attributes = resource.attributes ?? {};
  const name = attributes.name ?? "";
  const artist = attributes.artistName ?? "";
  const durationSeconds = attributes.durationInMillis ? Math.round(attributes.durationInMillis / 1000) : null;
  const titleScore = Math.max(similarity(item.youtubeTitle, name), similarity(stripNoise(item.youtubeTitle), name));
  const artistScore = Math.max(similarity(item.youtubeChannel, artist), similarity(item.priorBestAppleArtist, artist));
  const durationScore = scoreDuration(item.youtubeDurationSeconds, durationSeconds);
  const rawScore = titleScore * 0.5 + artistScore * 0.28 + durationScore * 0.22;

  return {
    id: resource.id,
    type: resource.type,
    name,
    artist,
    album: attributes.albumName ?? "",
    durationSeconds,
    url: attributes.url ?? "",
    titleScore: round(titleScore),
    artistScore: round(artistScore),
    durationScore: round(durationScore),
    rawScore: round(rawScore),
  };
}

function readFlag(name: string): string | null {
  const index = Bun.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return Bun.argv[index + 1] ?? null;
}

function readRequiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Add it to .env.`);
  }

  return value;
}

function stripNoise(value: string): string {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/【[^】]+】/g, " ")
    .replace(/\([^)]*(official|video|lyrics?|mv|visualizer|cover|full|ost|theme)[^)]*\)/gi, " ")
    .replace(/\b(official|music video|video|lyrics?|lyric video|visualizer|cover)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreDuration(left: number | null, right: number | null): number {
  if (!left || !right) {
    return 0.45;
  }

  const difference = Math.abs(left - right);

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

function dedupe(resources: AppleMusicCatalogResource[]): AppleMusicCatalogResource[] {
  const seen = new Set<string>();
  const result: AppleMusicCatalogResource[] = [];

  for (const resource of resources) {
    if (seen.has(resource.id)) {
      continue;
    }

    seen.add(resource.id);
    result.push(resource);
  }

  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
