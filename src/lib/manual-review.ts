import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { toCsv } from "./csv";
import { readFlag } from "./util";

export type ManualStatus =
  | "found_not_added"
  | "added"
  | "not_found"
  | "unavailable"
  | "skip_cover"
  | "skip_mix_or_longform"
  | "needs_user_decision";

export type ManualQueueItem = {
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

export type ManualProgressItem = {
  index: number;
  status: ManualStatus;
  youtubeTitle: string;
  appleSongId: string;
  appleName: string;
  appleArtist: string;
  appleAlbum: string;
  appleDurationSeconds: number | null;
  appleUrl: string;
  reviewerNotes: string;
  processedAt: string;
};

export const manualDataDir = "data/manual-review";
export const manualReportsDir = "reports/manual-review";
export const queuePath = `${manualDataDir}/queue.json`;
export const progressPath = `${manualDataDir}/progress.json`;
export const progressCsvPath = `${manualReportsDir}/progress.csv`;
export const progressCsvColumns: Array<keyof ManualProgressItem> = [
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
];

export function readManualQueue(): ManualQueueItem[] {
  return JSON.parse(readFileSync(queuePath, "utf8")) as ManualQueueItem[];
}

/** Reads the progress ledger; an absent ledger means nothing has been processed yet. */
export function readManualProgress(): ManualProgressItem[] {
  try {
    return JSON.parse(readFileSync(progressPath, "utf8")) as ManualProgressItem[];
  } catch {
    return [];
  }
}

export function upsertManualProgress(item: ManualProgressItem): void {
  mkdirSync(manualDataDir, { recursive: true });
  mkdirSync(manualReportsDir, { recursive: true });

  const progress = readManualProgress();
  const existingIndex = progress.findIndex((existing) => existing.index === item.index);

  if (existingIndex === -1) {
    progress.push(item);
  } else {
    progress[existingIndex] = item;
  }

  progress.sort((left, right) => left.index - right.index);
  writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  writeFileSync(progressCsvPath, toCsv(progress, progressCsvColumns));
}

/** Resolves the `--index` flag of the manual-review CLIs to its queue item. */
export function readQueueItemFromIndexFlag(missingHint = ""): ManualQueueItem {
  const targetIndex = Number(readFlag("--index"));

  if (!Number.isInteger(targetIndex)) {
    throw new Error("--index must be an integer.");
  }

  const item = readManualQueue().find((candidate) => candidate.index === targetIndex);

  if (!item) {
    throw new Error(`Could not find queue item ${targetIndex}.${missingHint}`);
  }

  return item;
}
