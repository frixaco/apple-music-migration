import { readFileSync, writeFileSync } from "node:fs";

type ConfidenceScore = 1 | 2 | 3 | 4 | 5;

type MatchReportItem = {
  index: number;
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
  notes: string[];
  searchQueries: string[];
  [key: string]: unknown;
};

type ManualOverride = {
  index: number;
  confidenceScore: ConfidenceScore;
  bestAppleId?: string;
  bestAppleType?: string;
  bestAppleName?: string;
  bestAppleArtist?: string;
  bestAppleAlbum?: string;
  bestAppleDurationSeconds?: number | null;
  bestAppleUrl?: string;
  titleSimilarity?: number;
  artistSimilarity?: number;
  durationScore?: number;
  versionScore?: number;
  rawScore?: number;
  notes?: string[];
  searchQueries?: string[];
};

const reportPath = "data/processed/youtube_apple_music_confidence.json";
const csvReportPath = "reports/youtube_apple_music_confidence.csv";
const overridesPath = "data/manual-overrides.json";
const report = JSON.parse(readFileSync(reportPath, "utf8")) as MatchReportItem[];
const overrides = JSON.parse(readFileSync(overridesPath, "utf8")) as ManualOverride[];
const reportByIndex = new Map(report.map((item) => [item.index, item]));

for (const override of overrides) {
  const existing = reportByIndex.get(override.index);

  if (!existing) {
    throw new Error(`Manual override references missing report index ${override.index}.`);
  }

  reportByIndex.set(override.index, {
    ...existing,
    ...override,
    confidenceLabel: confidenceLabel(override.confidenceScore),
    notes: override.notes ?? existing.notes,
    searchQueries: override.searchQueries ?? existing.searchQueries,
  });
}

const updatedReport = sortReportItems([...reportByIndex.values()]);
writeFileSync(reportPath, `${JSON.stringify(updatedReport, null, 2)}\n`);
writeFileSync(csvReportPath, toCsv(updatedReport));

console.log(`Applied manual overrides: ${overrides.length}`);
console.log(`Wrote ${reportPath}`);
console.log(`Wrote ${csvReportPath}`);

function confidenceLabel(score: ConfidenceScore): string {
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

function toCsv(items: MatchReportItem[]): string {
  const columns: Array<keyof MatchReportItem> = [
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
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const stringValue = Array.isArray(value) ? value.join(" | ") : String(value ?? "");

  return `"${stringValue.replaceAll("\"", "\"\"")}"`;
}
