import { readFileSync, writeFileSync } from "node:fs";
import { toCsv } from "./csv";
import type { ConfidenceScore } from "./matching";

export type MatchReportItem = {
  index: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  parsedArtist: string;
  parsedTitle: string;
  confidenceScore: ConfidenceScore;
  confidenceLabel: string;
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
  searchQueries: string[];
  notes: string[];
};

export const matchReportPath = "data/processed/youtube_apple_music_confidence.json";
export const matchReportCsvPath = "reports/youtube_apple_music_confidence.csv";
export const manualOverridesPath = "data/manual-overrides.json";

const csvColumns: Array<keyof MatchReportItem> = [
  "index",
  "confidenceScore",
  "confidenceLabel",
  "youtubeTitle",
  "youtubeChannel",
  "youtubeDurationSeconds",
  "parsedArtist",
  "parsedTitle",
  "bestAppleName",
  "bestAppleArtist",
  "bestAppleAlbum",
  "bestAppleType",
  "bestAppleDurationSeconds",
  "rawScore",
  "titleSimilarity",
  "artistSimilarity",
  "durationScore",
  "versionScore",
  "notes",
  "youtubeUrl",
  "bestAppleUrl",
  "bestAppleId",
  "youtubeVideoId",
  "searchQueries",
];

export function readMatchReport(): MatchReportItem[] {
  return JSON.parse(readFileSync(matchReportPath, "utf8")) as MatchReportItem[];
}

/** Writes the report as JSON and CSV, best matches first. */
export function writeMatchReport(items: MatchReportItem[]): void {
  const sortedItems = sortReportItems(items);

  writeFileSync(matchReportPath, `${JSON.stringify(sortedItems, null, 2)}\n`);
  writeFileSync(matchReportCsvPath, toCsv(sortedItems, csvColumns));
}

export function confidenceLabel(score: ConfidenceScore): string {
  switch (score) {
    case 5:
      return "very likely exact Apple Music match";
    case 4:
      return "likely match; review version/details";
    case 3:
      return "possible match; manual review needed";
    case 2:
      return "weak match";
    case 1:
      return "not found or very unlikely";
  }
}

function sortReportItems(items: MatchReportItem[]): MatchReportItem[] {
  return [...items].sort((left, right) => {
    const scoreDifference = right.confidenceScore - left.confidenceScore;

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const rawScoreDifference = right.rawScore - left.rawScore;

    if (rawScoreDifference !== 0) {
      return rawScoreDifference;
    }

    return left.index - right.index;
  });
}
