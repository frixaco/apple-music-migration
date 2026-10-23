import { mkdirSync, writeFileSync } from "node:fs";
import { toCsv } from "./lib/csv";
import { readMatchReport, type MatchReportItem } from "./lib/match-report";

const csvColumns: Array<keyof MatchReportItem> = [
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

const report = readMatchReport();
const reviewSet = report
  .filter((item) => item.confidenceScore >= 2 && item.confidenceScore <= 4)
  .sort((left, right) => left.confidenceScore - right.confidenceScore || right.rawScore - left.rawScore);

mkdirSync("reports/manual-review", { recursive: true });
writeFileSync("reports/manual-review/score-2-4-review.json", `${JSON.stringify(reviewSet, null, 2)}\n`);
writeFileSync("reports/manual-review/score-2-4-review.csv", toCsv(reviewSet, csvColumns));

console.log(`Exported review rows: ${reviewSet.length}`);
console.log("Wrote reports/manual-review/score-2-4-review.json");
console.log("Wrote reports/manual-review/score-2-4-review.csv");
