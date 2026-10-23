import { mkdirSync, writeFileSync } from "node:fs";
import { appleMusicClientFromEnv, type AppleMusicCatalogResource } from "./lib/apple-music-client";
import { dedupeCandidates, millisToSeconds, normalize, scoreDuration } from "./lib/matching";
import { readQueueItemFromIndexFlag, type ManualQueueItem } from "./lib/manual-review";
import { readFlag, round, unique } from "./lib/util";

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

const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "uz";
const item = readQueueItemFromIndexFlag(" Run bun run manual:init first.");

const client = appleMusicClientFromEnv();
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

const results = dedupeCandidates(resources)
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
  const durationSeconds = millisToSeconds(attributes.durationInMillis);
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

function stripNoise(value: string): string {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/【[^】]+】/g, " ")
    .replace(/\([^)]*(official|video|lyrics?|mv|visualizer|cover|full|ost|theme)[^)]*\)/gi, " ")
    .replace(/\b(official|music video|video|lyrics?|lyric video|visualizer|cover)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
