import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import confidenceReport from "../data/processed/youtube_apple_music_confidence.json" with { type: "json" };

type ConfidenceReportItem = {
  index: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  confidenceScore: number;
  bestAppleId: string;
  bestAppleType: string;
  bestAppleName: string;
  bestAppleArtist: string;
  bestAppleAlbum: string;
  bestAppleDurationSeconds: number | null;
  bestAppleUrl: string;
  notes: string[];
};

type ManualQueueItem = {
  index: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  priorConfidenceScore: number;
  priorBestAppleId: string;
  priorBestAppleType: string;
  priorBestAppleName: string;
  priorBestAppleArtist: string;
  priorBestAppleAlbum: string;
  priorBestAppleDurationSeconds: number | null;
  priorBestAppleUrl: string;
  priorNotes: string[];
};

const manualDataDir = "data/manual-review";
const manualReportsDir = "reports/manual-review";
const queuePath = `${manualDataDir}/queue.json`;
const progressPath = `${manualDataDir}/progress.json`;
const progressCsvPath = `${manualReportsDir}/progress.csv`;
const progressCsvHeader = [
  "index",
  "status",
  "youtubeTitle",
  "appleSongId",
  "appleName",
  "appleArtist",
  "appleAlbum",
  "appleDurationSeconds",
  "appleUrl",
  "reviewerNotes",
  "processedAt",
].join(",");
const queue = (confidenceReport as ConfidenceReportItem[])
  .slice()
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

function toQueueItem(item: ConfidenceReportItem): ManualQueueItem {
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
