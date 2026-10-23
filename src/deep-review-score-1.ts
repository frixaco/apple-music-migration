import { mkdirSync, writeFileSync } from "node:fs";
import { appleMusicClientFromEnv, type AppleMusicCatalogResource } from "./lib/apple-music-client";
import { artistBeforeDash, channelArtist, cleanSearch, dedupeCandidates, millisToSeconds, normalize, scoreDuration, type ConfidenceScore } from "./lib/matching";
import { readMatchReport, type MatchReportItem } from "./lib/match-report";
import { round, sleep, unique } from "./lib/util";

type Override = {
  index: number;
  confidenceScore: ConfidenceScore;
  bestAppleId: string;
  bestAppleType: string;
  bestAppleName: string;
  bestAppleArtist: string;
  bestAppleAlbum: string;
  bestAppleDurationSeconds: number | null;
  bestAppleUrl: string;
  titleSimilarity: number;
  artistSimilarity: number;
  durationScore: number;
  versionScore: number;
  rawScore: number;
  notes: string[];
  searchQueries: string[];
};

type ReviewedCandidate = {
  resource: AppleMusicCatalogResource;
  titleSimilarity: number;
  artistSimilarity: number;
  durationScore: number;
  rawScore: number;
};

const storefront = Bun.env.APPLE_MUSIC_STOREFRONT?.trim() || "uz";
const client = appleMusicClientFromEnv();
const report = readMatchReport();
const rows = report.filter((item) => item.confidenceScore === 1).sort((left, right) => left.index - right.index);
const overrides: Override[] = [];
const unchanged: Array<{ index: number; youtubeTitle: string; reason: string }> = [];
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
  "lyric",
  "mv",
  "music",
  "cover",
]);

mkdirSync("reports/manual-review", { recursive: true });

for (const [position, row] of rows.entries()) {
  const queries = buildDeepQueries(row);
  const candidates = await searchCandidates(queries);
  const best = chooseBest(row, candidates);
  const override = best ? decideOverride(row, best, queries) : null;

  if (override) {
    overrides.push(override);
  } else {
    unchanged.push({
      index: row.index,
      youtubeTitle: row.youtubeTitle,
      reason: best
        ? `best candidate stayed too weak: ${best.resource.attributes?.name ?? ""} by ${best.resource.attributes?.artistName ?? ""}`
        : "no Apple Music candidate found in expanded searches",
    });
  }

  if ((position + 1) % 25 === 0 || position + 1 === rows.length) {
    persist();
    console.log(`Deep-reviewed score 1 ${position + 1}/${rows.length}`);
  }
}

persist();
console.log(`Score 1 overrides suggested: ${overrides.length}`);
console.log(`Score 1 unchanged: ${unchanged.length}`);

function buildDeepQueries(row: MatchReportItem): string[] {
  const titleVariants = titleSearchVariants(row.youtubeTitle, row.parsedTitle);
  const artistVariants = artistSearchVariants(row.youtubeTitle, row.youtubeChannel, row.parsedArtist);
  const queries = [
    ...titleVariants,
    ...artistVariants.flatMap((artist) => titleVariants.map((title) => `${artist} ${title}`)),
  ];

  return unique(queries.map(cleanSearch).filter((query) => query.length >= 2)).slice(0, 12);
}

async function searchCandidates(queries: string[]): Promise<AppleMusicCatalogResource[]> {
  const allCandidates: AppleMusicCatalogResource[] = [];

  for (const query of queries) {
    const response = await client.searchCatalog({
      storefront,
      term: query,
      types: ["songs", "music-videos"],
      limit: 25,
    });

    allCandidates.push(...(response.results?.songs?.data ?? []));
    allCandidates.push(...(response.results?.["music-videos"]?.data ?? []));
    await sleep(100);
  }

  return dedupeCandidates(allCandidates);
}

function chooseBest(row: MatchReportItem, candidates: AppleMusicCatalogResource[]): ReviewedCandidate | null {
  const scored = candidates.map((resource) => {
    const titleSimilarity = Math.max(
      similarity(row.parsedTitle, resource.attributes?.name ?? ""),
      similarity(mainTitle(row.youtubeTitle), resource.attributes?.name ?? ""),
      similarity(extractQuotedTitle(row.youtubeTitle) ?? "", resource.attributes?.name ?? ""),
    );
    const artistSimilarity = Math.max(
      similarity(row.parsedArtist, resource.attributes?.artistName ?? ""),
      similarity(channelArtist(row.youtubeChannel), resource.attributes?.artistName ?? ""),
      artistMentionSimilarity(row.youtubeTitle, resource.attributes?.artistName ?? ""),
    );
    const durationScore = scoreDuration(row.youtubeDurationSeconds, millisToSeconds(resource.attributes?.durationInMillis));
    const rawScore = titleSimilarity * 0.52 + artistSimilarity * 0.3 + durationScore * 0.18;

    return { resource, titleSimilarity, artistSimilarity, durationScore, rawScore };
  });

  scored.sort((left, right) => right.rawScore - left.rawScore);

  return scored[0] ?? null;
}

function decideOverride(row: MatchReportItem, candidate: ReviewedCandidate, queries: string[]): Override | null {
  const score = confidenceFromReviewedCandidate(row, candidate);

  if (score < 3) {
    return null;
  }

  return candidateOverride(row, candidate, score, queries);
}

function confidenceFromReviewedCandidate(row: MatchReportItem, candidate: ReviewedCandidate): ConfidenceScore {
  const lowerTitle = row.youtubeTitle.toLowerCase();
  const longForm = (row.youtubeDurationSeconds ?? 0) >= 600;
  const likelyCover = /\bcover\b|歌いました|covered by/i.test(row.youtubeTitle);
  const videoPaddingLikely =
    lowerTitle.includes("official")
    || lowerTitle.includes("mv")
    || lowerTitle.includes("music video")
    || lowerTitle.includes("visualizer")
    || lowerTitle.includes("lyric");

  if (longForm) {
    return 1;
  }

  if (candidate.titleSimilarity >= 0.94 && candidate.artistSimilarity >= 0.82 && candidate.durationScore >= 0.78) {
    return 5;
  }

  if (candidate.titleSimilarity >= 0.94 && candidate.artistSimilarity >= 0.82 && videoPaddingLikely && candidate.durationScore >= 0.25) {
    return 4;
  }

  if (candidate.titleSimilarity >= 0.86 && candidate.artistSimilarity >= 0.68 && candidate.durationScore >= 0.56) {
    return 4;
  }

  if (likelyCover && candidate.titleSimilarity >= 0.82 && candidate.artistSimilarity >= 0.68 && candidate.durationScore >= 0.45) {
    return 3;
  }

  if (candidate.titleSimilarity >= 0.78 && candidate.artistSimilarity >= 0.58 && candidate.durationScore >= 0.45) {
    return 3;
  }

  return 1;
}

function candidateOverride(
  row: MatchReportItem,
  candidate: ReviewedCandidate,
  score: ConfidenceScore,
  queries: string[],
): Override {
  const attributes = candidate.resource.attributes ?? {};

  return {
    index: row.index,
    confidenceScore: score,
    bestAppleId: candidate.resource.id,
    bestAppleType: candidate.resource.type,
    bestAppleName: attributes.name ?? "",
    bestAppleArtist: attributes.artistName ?? "",
    bestAppleAlbum: attributes.albumName ?? "",
    bestAppleDurationSeconds: millisToSeconds(attributes.durationInMillis),
    bestAppleUrl: attributes.url ?? "",
    titleSimilarity: round(candidate.titleSimilarity),
    artistSimilarity: round(candidate.artistSimilarity),
    durationScore: round(candidate.durationScore),
    versionScore: 1,
    rawScore: round(candidate.rawScore),
    notes: [
      "score 1 deep manual pass: recovered via expanded Apple Music searches",
      ...candidateNotes(candidate),
    ],
    searchQueries: queries,
  };
}

function candidateNotes(candidate: ReviewedCandidate): string[] {
  const notes: string[] = [];

  if (candidate.resource.type === "music-videos") {
    notes.push("best candidate is a music video");
  }

  if (candidate.durationScore < 0.5) {
    notes.push("duration differs significantly");
  }

  if (candidate.artistSimilarity < 0.7) {
    notes.push("artist similarity needs review");
  }

  return notes;
}

function titleSearchVariants(youtubeTitle: string, parsedTitle: string): string[] {
  return [
    parsedTitle,
    mainTitle(youtubeTitle),
    stripAfterSeparators(youtubeTitle),
    stripCoverWords(youtubeTitle),
    extractQuotedTitle(youtubeTitle),
    titleAfterSlash(youtubeTitle),
    titleBeforeSlash(youtubeTitle),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function artistSearchVariants(youtubeTitle: string, channel: string, parsedArtist: string): string[] {
  return [
    parsedArtist,
    channelArtist(channel),
    artistBeforeDash(youtubeTitle),
    artistBeforeQuotedTitle(youtubeTitle),
    artistAfterBy(youtubeTitle),
  ].filter((value): value is string => Boolean(value?.trim()));
}

function mainTitle(value: string): string {
  return stripCoverWords(stripAfterSeparators(value))
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/【[^】]+】/g, " ")
    .replace(/\([^)]*(official|video|lyrics?|mv|visualizer|full|ost|theme)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAfterSeparators(value: string): string {
  return value
    .split(/\s[-–—]\s+(official|lyric|lyrics|music video|mv|m\/v|visualizer|theme|ost|full|english)\b/i)[0]
    ?.trim() ?? value.trim();
}

function stripCoverWords(value: string): string {
  return value
    .replace(/\b(official|music video|video|lyrics?|lyric video|visualizer|original song|full stream|album official full stream|cover|covered by)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedTitle(value: string): string | null {
  const match = value.match(/[\"'“”‘’「『](.+?)[\"'“”‘’」』]/);

  return match?.[1]?.trim() ?? null;
}

function titleAfterSlash(value: string): string | null {
  const parts = value.split("/");

  return parts.length > 1 ? parts[1]?.trim() ?? null : null;
}

function titleBeforeSlash(value: string): string | null {
  const parts = value.split("/");

  return parts.length > 1 ? parts[0]?.trim() ?? null : null;
}

function artistBeforeQuotedTitle(value: string): string | null {
  const match = value.match(/^(.+?)\s+[\"'“”‘’「『]/);

  return match?.[1]?.trim() ?? null;
}

function artistAfterBy(value: string): string | null {
  const match = value.match(/\bby\s+([^[(|]+)/i);

  return match?.[1]?.trim() ?? null;
}

function artistMentionSimilarity(youtubeTitle: string, appleArtist: string): number {
  const normalizedTitle = normalize(youtubeTitle);
  const normalizedArtist = normalize(appleArtist);

  if (!normalizedArtist) {
    return 0;
  }

  if (normalizedTitle.includes(normalizedArtist)) {
    return 1;
  }

  return similarity(youtubeTitle, appleArtist) * 0.7;
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
  return normalize(value).split(" ").filter((token) => token.length > 1 && !stopWords.has(token));
}

function persist(): void {
  writeFileSync("reports/manual-review/score-1-deep-review-overrides.json", `${JSON.stringify(overrides, null, 2)}\n`);
  writeFileSync("reports/manual-review/score-1-deep-review-unchanged.json", `${JSON.stringify(unchanged, null, 2)}\n`);
}
