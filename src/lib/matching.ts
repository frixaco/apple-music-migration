import type { AppleMusicCatalogResource } from "./apple-music-client";
import { unique } from "./util";

export type ParsedTitle = { artist: string; track: string; cleanedTitle: string };

/** The YouTube side of a match: channel names to compare artists against, and the video length. */
export type ScoredVideo = { channels: string[]; durationSeconds: number | null };

export type ConfidenceScore = 1 | 2 | 3 | 4 | 5;

export type CandidateScore = {
  resource: AppleMusicCatalogResource;
  rawScore: number;
  titleSimilarity: number;
  artistSimilarity: number;
  durationScore: number;
  versionScore: number;
  notes: string[];
};

export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSearch(value: string): string {
  return value.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}

export function channelArtist(value: string): string {
  return value
    .replace(/\bofficial\b/gi, " ")
    .replace(/\b(channel|youtube|music|records|recordings|label|labels|topic)\b/gi, " ")
    .replace(/\bch\.\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function artistBeforeDash(value: string): string | null {
  const match = value.match(/^(.+?)\s[-–—]\s/);

  return match?.[1]?.trim() ?? null;
}

export function dedupeCandidates(candidates: AppleMusicCatalogResource[]): AppleMusicCatalogResource[] {
  const seen = new Set<string>();
  const deduped: AppleMusicCatalogResource[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

/** Scores how close two durations in seconds are; 0.45 when either is unknown. */
export function scoreDuration(leftSeconds: number | null, rightSeconds: number | null): number {
  if (!leftSeconds || !rightSeconds) {
    return 0.45;
  }

  const difference = Math.abs(leftSeconds - rightSeconds);

  if (difference <= 4) return 1;
  if (difference <= 8) return 0.92;
  if (difference <= 15) return 0.78;
  if (difference <= 30) return 0.56;
  if (difference <= 60) return 0.32;
  return 0.08;
}

export function millisToSeconds(milliseconds: number | undefined): number | null {
  return milliseconds ? Math.round(milliseconds / 1000) : null;
}

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

export function parseYouTubeTitle(title: string, channel: string): ParsedTitle {
  const cleanedTitle = cleanTitle(title);
  const metadataSplit = splitMetadataSuffix(cleanedTitle);

  if (metadataSplit) {
    return {
      artist: channelArtist(channel),
      track: metadataSplit.title,
      cleanedTitle,
    };
  }

  const bracketArtist = title.match(/【([^】]+)】([^【]+)【([^】]+)】/);

  if (bracketArtist) {
    return {
      artist: channelArtist(bracketArtist[3]),
      track: cleanTitle(bracketArtist[2]),
      cleanedTitle,
    };
  }

  const dashParts = cleanedTitle.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);

  if (dashParts.length >= 2) {
    return {
      artist: channelArtist(dashParts[0] ?? ""),
      track: cleanTitle(dashParts.slice(1).join(" - ")),
      cleanedTitle,
    };
  }

  const quoted = title.match(/^(.+?)\s+["'‘“「](.+?)["'’”」]/);

  if (quoted) {
    return {
      artist: channelArtist(quoted[1]),
      track: cleanTitle(quoted[2]),
      cleanedTitle,
    };
  }

  return {
    artist: channelArtist(channel),
    track: cleanedTitle,
    cleanedTitle,
  };
}

export function buildSearchQueries(title: string, channel: string, parsed: ParsedTitle): string[] {
  const metadataSplit = splitMetadataSuffix(cleanTitle(title));
  return unique([
    `${parsed.artist} ${parsed.track}`,
    parsed.track,
    metadataSplit?.title ?? "",
    parsed.cleanedTitle,
    `${channelArtist(channel)} ${parsed.track}`,
    title,
  ].map(cleanSearch).filter((query) => query.length >= 2)).slice(0, 4);
}

export function scoreCandidate(
  video: ScoredVideo,
  parsed: ParsedTitle,
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
    ...video.channels.map((channel) => similarity(appleArtist, channelArtist(channel))),
  );
  const durationScore = scoreDuration(video.durationSeconds, appleDurationSeconds);
  const versionScore = scoreVersionWords(parsed.cleanedTitle, appleName);
  const officialBoost = isOfficialChannelMatch(video.channels[0] ?? "", appleArtist) ? 0.04 : 0;
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

export function confidenceScore(best: CandidateScore | null): ConfidenceScore {
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
  const normalized = normalize(value);
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

  return metadataWords.some((word) => normalized.includes(normalize(word)));
}

function normalizedTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function similarity(left: string, right: string): number {
  const leftComparable = normalize(left);
  const rightComparable = normalize(right);

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
  const normalized = normalize(value);
  const words = ["remix", "live", "acoustic", "instrumental", "cover", "mix", "edit", "version", "feat"];

  return new Set(words.filter((word) => normalized.includes(word)));
}

function isOfficialChannelMatch(channel: string, appleArtist: string): boolean {
  const cleanChannel = channelArtist(channel);

  return /official/i.test(channel) && similarity(cleanChannel, appleArtist) >= 0.45;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
