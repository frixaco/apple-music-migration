import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readMatchReport, type MatchReportItem } from "./lib/match-report";
import { manualDataDir, manualReportsDir, progressCsvColumns, progressCsvPath, progressPath, queuePath, type ManualQueueItem } from "./lib/manual-review";

const progressCsvHeader = progressCsvColumns.join(",");
const queue = readMatchReport()
  .sort((left, right) => left.index - right.index)
  .map(toQueueItem);

mkdirSync(manualDataDir, { recursive: true });
mkdirSync(manualReportsDir, { recursive: true });
writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);

if (!existsSync(progressPath)) {
  writeFileSync(progressPath, "[]\n");
}

const existingProgress = JSON.parse(readFileSync(progressPath, "utf8")) as unknown[];

if (existingProgress.length === 0) {
  writeFileSync(progressCsvPath, `${progressCsvHeader}\n`);
}

console.log(`Manual queue items: ${queue.length}`);
console.log(`Manual progress items: ${existingProgress.length}`);
console.log(`Wrote ${queuePath}`);
console.log(`Progress ledger: ${progressPath}`);

function toQueueItem(item: MatchReportItem): ManualQueueItem {
  return {
    index: item.index,
    youtubeVideoId: item.youtubeVideoId,
    youtubeUrl: item.youtubeUrl,
    youtubeTitle: item.youtubeTitle,
    youtubeChannel: item.youtubeChannel,
    youtubeDurationSeconds: item.youtubeDurationSeconds,
    priorConfidenceScore: item.confidenceScore,
    priorBestAppleId: item.bestAppleId,
    priorBestAppleType: item.bestAppleType,
    priorBestAppleName: item.bestAppleName,
    priorBestAppleArtist: item.bestAppleArtist,
    priorBestAppleAlbum: item.bestAppleAlbum,
    priorBestAppleDurationSeconds: item.bestAppleDurationSeconds,
    priorBestAppleUrl: item.bestAppleUrl,
    priorNotes: item.notes,
  };
}
