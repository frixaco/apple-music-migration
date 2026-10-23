import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import rawPlaylist from "../data/raw/youtube_playlist_raw.json" with { type: "json" };
import { appleMusicClientFromEnv, type AppleMusicCatalogResource } from "./lib/apple-music-client";
import { confidenceLabel, matchReportCsvPath, matchReportPath, writeMatchReport, type MatchReportItem } from "./lib/match-report";
import {
  buildSearchQueries,
  confidenceScore,
  dedupeCandidates,
  millisToSeconds,
  parseYouTubeTitle,
  scoreCandidate,
  type CandidateScore,
  type ParsedTitle,
} from "./lib/matching";
import { round, sleep, unique } from "./lib/util";

type YouTubeEntry = {
  id?: string;
  title?: string;
  url?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
};

type PlaylistManifest = {
  entries?: YouTubeEntry[];
};

type SearchCache = Record<string, AppleMusicCatalogResource[]>;

const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "us";
const client = appleMusicClientFromEnv();
const playlist = rawPlaylist as PlaylistManifest;
const entries = playlist.entries ?? [];
const cachePath = "data/cache/apple-catalog-search.json";
const onlyMaxScore = readOptionalScoreFlag("--only-max-score");
const cache = loadSearchCache(cachePath);
const report: MatchReportItem[] = [];
const existingReport = loadExistingReport(matchReportPath);

mkdirSync("data/cache", { recursive: true });
mkdirSync("data/processed", { recursive: true });
mkdirSync("reports", { recursive: true });

for (const [entryIndex, entry] of entries.entries()) {
  const index = entryIndex + 1;
  const existingItem = existingReport.get(index);

  if (existingItem && onlyMaxScore !== null && existingItem.confidenceScore > onlyMaxScore) {
    report.push(existingItem);

    if (index % 25 === 0 || index === entries.length) {
      persistReports(report, cache);
      console.log(`Scored ${index}/${entries.length}`);
    }

    continue;
  }

  const title = entry.title?.trim() ?? "";
  const channel = (entry.channel ?? entry.uploader ?? "").trim();
  const parsed = parseYouTubeTitle(title, channel);
  const queries = buildSearchQueries(title, channel, parsed);
  const candidates = await searchCandidates(queries);
  const best = chooseBestCandidate(entry, parsed, candidates);

  report.push(toReportItem(index, entry, parsed, queries, best));

  if (index % 25 === 0 || index === entries.length) {
    persistReports(report, cache);
    console.log(`Scored ${index}/${entries.length}`);
  }
}

persistReports(report, cache);
console.log(`Wrote ${matchReportPath}`);
console.log(`Wrote ${matchReportCsvPath}`);

function readOptionalScoreFlag(name: string): 1 | 2 | 3 | 4 | 5 | null {
  const flag = Bun.argv.find((argument) => argument.startsWith(`${name}=`));

  if (!flag) {
    return null;
  }

  const value = Number(flag.slice(name.length + 1));

  if (![1, 2, 3, 4, 5].includes(value)) {
    throw new Error(`${name} must be one of 1, 2, 3, 4, or 5.`);
  }

  return value as 1 | 2 | 3 | 4 | 5;
}

async function searchCandidates(queries: string[]): Promise<AppleMusicCatalogResource[]> {
  const candidates: AppleMusicCatalogResource[] = [];

  for (const query of queries) {
    const cacheKey = `${storefront}\t${query}`;
    const cached = cache[cacheKey];

    if (cached) {
      candidates.push(...cached);
      continue;
    }

    const response = await retry(() => client.searchCatalog({
      storefront,
      term: query,
      types: ["songs", "music-videos"],
      limit: 25,
    }));
    const results = [
      ...(response.results?.songs?.data ?? []),
      ...(response.results?.["music-videos"]?.data ?? []),
    ];

    cache[cacheKey] = results;
    candidates.push(...results);
    await sleep(120);
  }

  return dedupeCandidates(candidates);
}

function chooseBestCandidate(
  entry: YouTubeEntry,
  parsed: ParsedTitle,
  candidates: AppleMusicCatalogResource[],
): CandidateScore | null {
  const scored = candidates.map((candidate) => scoreCandidate(
    { channels: [entry.channel ?? "", entry.uploader ?? ""], durationSeconds: entry.duration ?? null },
    parsed,
    candidate,
  ));
  scored.sort((left, right) => right.rawScore - left.rawScore);

  return scored[0] ?? null;
}

function toReportItem(
  index: number,
  entry: YouTubeEntry,
  parsed: ParsedTitle,
  queries: string[],
  best: CandidateScore | null,
): MatchReportItem {
  const score = confidenceScore(best);
  const attributes = best?.resource.attributes;
  const durationSeconds = millisToSeconds(attributes?.durationInMillis);

  return {
    index,
    youtubeVideoId: entry.id ?? "",
    youtubeUrl: entry.url ?? (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : ""),
    youtubeTitle: entry.title ?? "",
    youtubeChannel: entry.channel ?? entry.uploader ?? "",
    youtubeDurationSeconds: entry.duration ?? null,
    parsedArtist: parsed.artist,
    parsedTitle: parsed.track,
    confidenceScore: score,
    confidenceLabel: confidenceLabel(score),
    bestAppleId: best?.resource.id ?? "",
    bestAppleType: best?.resource.type ?? "",
    bestAppleName: attributes?.name ?? "",
    bestAppleArtist: attributes?.artistName ?? "",
    bestAppleAlbum: attributes?.albumName ?? "",
    bestAppleDurationSeconds: durationSeconds,
    bestAppleUrl: attributes?.url ?? "",
    titleSimilarity: round(best?.titleSimilarity ?? 0),
    artistSimilarity: round(best?.artistSimilarity ?? 0),
    durationScore: round(best?.durationScore ?? 0),
    versionScore: round(best?.versionScore ?? 0),
    rawScore: round(best?.rawScore ?? 0),
    searchQueries: queries,
    notes: best?.notes ?? ["no Apple Music candidates found"],
  };
}

async function retry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

function loadSearchCache(path: string): SearchCache {
  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, "utf8")) as SearchCache;
}

function loadExistingReport(path: string): Map<number, MatchReportItem> {
  if (!existsSync(path) || onlyMaxScore === null) {
    return new Map();
  }

  const items = JSON.parse(readFileSync(path, "utf8")) as MatchReportItem[];

  return new Map(items.map((item) => [item.index, item]));
}

function persistReports(items: MatchReportItem[], searchCache: SearchCache): void {
  writeFileSync(cachePath, JSON.stringify(searchCache));
  writeMatchReport(items);
}
