import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type MatchReportItem = {
  index: number;
  confidenceScore: number;
  rawScore: number;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  parsedArtist: string;
  parsedTitle: string;
  bestAppleName: string;
  bestAppleArtist: string;
  bestAppleAlbum: string;
  bestAppleType: string;
  bestAppleDurationSeconds: number | null;
  bestAppleUrl: string;
  notes: string[];
};

const report = JSON.parse(readFileSync("data/processed/youtube_apple_music_confidence.json", "utf8")) as MatchReportItem[];
const reviewSet = report
  .filter((item) => item.confidenceScore >= 2 && item.confidenceScore <= 4)
  .sort((left, right) => left.confidenceScore - right.confidenceScore || right.rawScore - left.rawScore);

mkdirSync("reports/manual-review", { recursive: true });
writeFileSync("reports/manual-review/score-2-4-review.json", `${JSON.stringify(reviewSet, null, 2)}\n`);
writeFileSync("reports/manual-review/score-2-4-review.csv", toCsv(reviewSet));

console.log(`Exported review rows: ${reviewSet.length}`);
console.log("Wrote reports/manual-review/score-2-4-review.json");
console.log("Wrote reports/manual-review/score-2-4-review.csv");

function toCsv(items: MatchReportItem[]): string {
  const columns: Array<keyof MatchReportItem> = [
    "index",
    "confidenceScore",
    "rawScore",
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
    "bestAppleUrl",
    "notes",
  ];
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const stringValue = Array.isArray(value) ? value.join(" | ") : String(value ?? "");

  return `"${stringValue.replaceAll("\"", "\"\"")}"`;
}
