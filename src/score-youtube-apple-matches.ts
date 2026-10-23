import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import rawPlaylist from "../data/raw/youtube_playlist_raw.json" with { type: "json" };
import { appleMusicClientFromEnv, type AppleMusicCatalogResource } from "./lib/apple-music-client";
import { confidenceLabel, matchReportCsvPath, matchReportPath, writeMatchReport, type MatchReportItem } from "./lib/match-report";
import { dedupeCandidates, millisToSeconds, scoreDuration } from "./lib/matching";
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

type CandidateScore = {
  resource: AppleMusicCatalogResource;
  rawScore: number;
  titleSimilarity: number;
  artistSimilarity: number;
  durationScore: number;
  versionScore: number;
  notes: string[];
};

const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "us";
const client = appleMusicClientFromEnv();
const playlist = rawPlaylist as PlaylistManifest;
const entries = playlist.entries ?? [];
const cachePath = "data/cache/apple-catalog-search.json";
const onlyMaxScore = readOptionalScoreFlag("--only-max-score");
const stopWords = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "feat",
  "ft",
  "featuring",
  "official",
  "video",
  "audio",
  "lyrics",
  "mv",
  "music",
]);
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

function parseYouTubeTitle(title: string, channel: string): { artist: string; track: string; cleanedTitle: string } {
  const cleanedTitle = cleanTitle(title);
  const metadataSplit = splitMetadataSuffix(cleanedTitle);

  if (metadataSplit) {
    return {
      artist: cleanArtist(channel),
      track: metadataSplit.title,
      cleanedTitle,
    };
  }

  const bracketArtist = title.match(/【([^】]+)】([^【]+)【([^】]+)】/);

  if (bracketArtist) {
    return {
      artist: cleanArtist(bracketArtist[3] ?? ""),
      track: cleanTitle(bracketArtist[2] ?? cleanedTitle),
      cleanedTitle,
    };
  }

  const dashParts = cleanedTitle.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);

  if (dashParts.length >= 2) {
    return {
      artist: cleanArtist(dashParts[0] ?? ""),
      track: cleanTitle(dashParts.slice(1).join(" - ")),
      cleanedTitle,
    };
  }

  const quoted = title.match(/^(.+?)\s+[\"'‘“「](.+?)[\"'’”」]/);

  if (quoted) {
    return {
      artist: cleanArtist(quoted[1] ?? ""),
      track: cleanTitle(quoted[2] ?? ""),
      cleanedTitle,
    };
  }

  return {
    artist: cleanArtist(channel),
    track: cleanedTitle,
    cleanedTitle,
  };
}

function buildSearchQueries(title: string, channel: string, parsed: { artist: string; track: string; cleanedTitle: string }): string[] {
  const metadataSplit = splitMetadataSuffix(cleanTitle(title));
  return unique([
    `${parsed.artist} ${parsed.track}`,
    parsed.track,
    metadataSplit?.title ?? "",
    parsed.cleanedTitle,
    `${cleanArtist(channel)} ${parsed.track}`,
    title,
  ].map(normalizeSearchTerm).filter((query) => query.length >= 2)).slice(0, 4);
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
  parsed: { artist: string; track: string; cleanedTitle: string },
  candidates: AppleMusicCatalogResource[],
): CandidateScore | null {
  const scored = candidates.map((candidate) => scoreCandidate(entry, parsed, candidate));
  scored.sort((left, right) => right.rawScore - left.rawScore);

  return scored[0] ?? null;
}

function scoreCandidate(
  entry: YouTubeEntry,
  parsed: { artist: string; track: string; cleanedTitle: string },
  resource: AppleMusicCatalogResource,
): CandidateScore {
  const attributes = resource.attributes ?? {};
  const appleName = attributes.name ?? "";
  const appleArtist = attributes.artistName ?? "";
  const appleDurationSeconds = millisToSeconds(attributes.durationInMillis);
  const titleSimilarity = Math.max(
    similarity(appleName, parsed.track),
    similarity(appleName, parsed.cleanedTitle),
  );
  const artistSimilarity = Math.max(
    similarity(appleArtist, parsed.artist),
    similarity(appleArtist, cleanArtist(entry.channel ?? "")),
    similarity(appleArtist, cleanArtist(entry.uploader ?? "")),
  );
  const durationScore = scoreDuration(entry.duration ?? null, appleDurationSeconds);
  const versionScore = scoreVersionWords(parsed.cleanedTitle, appleName);
  const officialBoost = isOfficialChannelMatch(entry.channel ?? "", appleArtist) ? 0.04 : 0;
  const typePenalty = resource.type === "music-videos" ? 0.04 : 0;
  const rawScore = clamp01(
    titleSimilarity * 0.46
    + artistSimilarity * 0.24
    + durationScore * 0.22
    + versionScore * 0.08
    + officialBoost
    - typePenalty,
  );
  const notes = buildCandidateNotes(resource, titleSimilarity, artistSimilarity, durationScore, versionScore);

  return {
    resource,
    rawScore,
    titleSimilarity,
    artistSimilarity,
    durationScore,
    versionScore,
    notes,
  };
}

function toReportItem(
  index: number,
  entry: YouTubeEntry,
  parsed: { artist: string; track: string; cleanedTitle: string },
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

function confidenceScore(best: CandidateScore | null): 1 | 2 | 3 | 4 | 5 {
  if (!best) {
    return 1;
  }

  if (best.rawScore >= 0.88 && best.titleSimilarity >= 0.82 && best.durationScore >= 0.72 && best.artistSimilarity >= 0.45) {
    return 5;
  }

  if (best.rawScore >= 0.74 && best.titleSimilarity >= 0.68 && best.durationScore >= 0.45) {
    return 4;
  }

  if (best.rawScore >= 0.58 && best.titleSimilarity >= 0.48) {
    return 3;
  }

  if (best.rawScore >= 0.38) {
    return 2;
  }

  return 1;
}

function buildCandidateNotes(
  resource: AppleMusicCatalogResource,
  titleSimilarity: number,
  artistSimilarity: number,
  durationScore: number,
  versionScore: number,
): string[] {
  const notes: string[] = [];

  if (resource.type === "music-videos") {
    notes.push("best candidate is a music video");
  }

  if (titleSimilarity < 0.68) {
    notes.push("title similarity is low");
  }

  if (artistSimilarity < 0.45) {
    notes.push("artist/channel similarity is low");
  }

  if (durationScore < 0.45) {
    notes.push("duration differs significantly");
  }

  if (versionScore < 1) {
    notes.push("version words differ");
  }

  return notes.length > 0 ? notes : ["strong title/artist/duration agreement"];
}

function cleanTitle(value: string): string {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\[[^\]]*(official|lyrics?|audio|mv|m\/v|visualizer|color coded|kan_rom_eng|monstercat release|hd|4k)[^\]]*\]/gi, " ")
    .replace(/\([^)]*(official|lyrics?|audio|mv|m\/v|visualizer|color coded|kan_rom_eng|hd|4k)[^)]*\)/gi, " ")
    .replace(/\s[-–—]\s+(official\s+)?(english\s+)?lyrics?.*$/gi, " ")
    .replace(/【\s*(official|original song|mv|music video|lyrics?)\s*】/gi, " ")
    .replace(/\b(official\s+)?(music\s+)?video\b/gi, " ")
    .replace(/\bofficial\s+(audio|mv|m\/v|visualizer|lyrics?)\b/gi, " ")
    .replace(/\blyrics?\b/gi, " ")
    .replace(/\bHD\b|\b4K\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitMetadataSuffix(value: string): { title: string; metadata: string } | null {
  const parts = value.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const metadata = parts.slice(1).join(" - ");

  if (!isMetadataSuffix(metadata)) {
    return null;
  }

  return {
    title: cleanTitle(parts[0] ?? ""),
    metadata,
  };
}

function isMetadataSuffix(value: string): boolean {
  const normalized = normalizeComparable(value);
  const metadataWords = [
    "official",
    "lyrics",
    "english",
    "translation",
    "theme",
    "ost",
    "soundtrack",
    "opening",
    "ending",
    "color coded",
    "kan rom eng",
    "romaji",
  ];

  return metadataWords.some((word) => normalized.includes(normalizeComparable(word)));
}

function cleanArtist(value: string): string {
  return value
    .replace(/\bofficial\b/gi, " ")
    .replace(/\b(channel|youtube|music|records|recordings|label|labels|topic)\b/gi, " ")
    .replace(/\bch\.\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchTerm(value: string): string {
  return value.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedTokens(value: string): string[] {
  return normalizeComparable(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(left: string, right: string): number {
  const leftComparable = normalizeComparable(left);
  const rightComparable = normalizeComparable(right);

  if (!leftComparable || !rightComparable) {
    return 0;
  }

  if (leftComparable === rightComparable) {
    return 1;
  }

  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  const tokenScore = tokenSimilarity(leftTokens, rightTokens);
  const editScore = 1 - levenshteinDistance(leftComparable, rightComparable) / Math.max(leftComparable.length, rightComparable.length);

  return clamp01(Math.max(tokenScore, editScore * 0.88));
}

function tokenSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const containment = intersection / Math.min(leftSet.size, rightSet.size);
  const jaccard = intersection / new Set([...leftSet, ...rightSet]).size;

  return clamp01(containment * 0.7 + jaccard * 0.3);
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function scoreVersionWords(youtubeTitle: string, appleTitle: string): number {
  const youtubeWords = versionWords(youtubeTitle);
  const appleWords = versionWords(appleTitle);

  if (youtubeWords.size === 0 && appleWords.size === 0) {
    return 1;
  }

  const shared = [...youtubeWords].filter((word) => appleWords.has(word)).length;
  const total = new Set([...youtubeWords, ...appleWords]).size;

  return total === 0 ? 1 : shared / total;
}

function versionWords(value: string): Set<string> {
  const normalized = normalizeComparable(value);
  const words = ["remix", "live", "acoustic", "instrumental", "cover", "mix", "edit", "version", "feat"];

  return new Set(words.filter((word) => normalized.includes(word)));
}

function isOfficialChannelMatch(channel: string, appleArtist: string): boolean {
  const cleanChannel = cleanArtist(channel);

  return /official/i.test(channel) && similarity(cleanChannel, appleArtist) >= 0.45;
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function persistReports(items: MatchReportItem[], searchCache: SearchCache): void {
  writeFileSync(cachePath, JSON.stringify(searchCache));
  writeMatchReport(items);
}
