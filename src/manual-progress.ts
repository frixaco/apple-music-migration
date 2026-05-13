import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type ManualStatus =
  | "found_not_added"
  | "added"
  | "not_found"
  | "unavailable"
  | "skip_cover"
  | "skip_mix_or_longform"
  | "needs_user_decision";

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

const progressPath = "data/manual-review/progress.json";
const progressCsvPath = "reports/manual-review/progress.csv";

export function upsertManualProgress(item: ManualProgressItem): void {
  mkdirSync("data/manual-review", { recursive: true });
  mkdirSync("reports/manual-review", { recursive: true });

  const progress = readManualProgress();
  const existingIndex = progress.findIndex((existing) => existing.index === item.index);

  if (existingIndex === -1) {
    progress.push(item);
  } else {
    progress[existingIndex] = item;
  }

  progress.sort((left, right) => left.index - right.index);
  writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  writeFileSync(progressCsvPath, toCsv(progress));
}

export function readManualProgress(): ManualProgressItem[] {
  try {
    return JSON.parse(readFileSync(progressPath, "utf8")) as ManualProgressItem[];
  } catch {
    return [];
  }
}

function toCsv(items: ManualProgressItem[]): string {
  const columns: Array<keyof ManualProgressItem> = [
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
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}
