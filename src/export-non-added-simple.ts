import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { ManualProgressItem, ManualStatus } from "./manual-progress.ts";

type QueueItem = {
  index: number;
  youtubeUrl: string;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
};

type NonAddedItem = {
  index: number;
  status: Exclude<ManualStatus, "added">;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  youtubeUrl: string;
  reviewerNotes: string;
};

const progress = JSON.parse(readFileSync("data/manual-review/progress.json", "utf8")) as ManualProgressItem[];
const queue = JSON.parse(readFileSync("data/manual-review/queue.json", "utf8")) as QueueItem[];
const queueByIndex = new Map(queue.map((item) => [item.index, item]));
const nonAdded = progress
  .filter((item) => item.status !== "added")
  .map((item) => toNonAddedItem(item, queueByIndex.get(item.index)))
  .sort((left, right) => left.index - right.index);

mkdirSync("reports/manual-review", { recursive: true });
mkdirSync("docs", { recursive: true });
writeFileSync("reports/manual-review/non-added-simple.csv", toCsv(nonAdded));
writeFileSync("reports/manual-review/non-added-simple.md", toMarkdown(nonAdded));
writeFileSync("data/manual-review/non-added-simple.csv", toCsv(nonAdded));
writeFileSync("docs/non-added-youtube-items.md", toMarkdown(nonAdded));

console.log(`Exported non-added items: ${nonAdded.length}`);
console.log("Wrote reports/manual-review/non-added-simple.csv");
console.log("Wrote reports/manual-review/non-added-simple.md");
console.log("Wrote data/manual-review/non-added-simple.csv");
console.log("Wrote docs/non-added-youtube-items.md");

function toNonAddedItem(progressItem: ManualProgressItem, queueItem: QueueItem | undefined): NonAddedItem {
  return {
    index: progressItem.index,
    status: progressItem.status as Exclude<ManualStatus, "added">,
    youtubeTitle: progressItem.youtubeTitle,
    youtubeChannel: queueItem?.youtubeChannel ?? "",
    youtubeDurationSeconds: queueItem?.youtubeDurationSeconds ?? null,
    youtubeUrl: queueItem?.youtubeUrl ?? "",
    reviewerNotes: progressItem.reviewerNotes,
  };
}

function toMarkdown(items: NonAddedItem[]): string {
  const statusCounts = items.reduce<Record<string, number>>(
    (counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }),
    {},
  );
  const statusSummary = Object.entries(statusCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `- ${status}: ${count}`)
    .join("\n");
  const rows = items
    .map((item) =>
      [
        item.index,
        item.status,
        markdownCell(item.youtubeTitle),
        markdownCell(item.youtubeChannel),
        formatDuration(item.youtubeDurationSeconds),
        markdownLink("open", item.youtubeUrl),
        markdownCell(item.reviewerNotes),
      ].join(" | "),
    )
    .join("\n");

  return [
    "# Non-Added YouTube Items",
    "",
    `Total: ${items.length}`,
    "",
    statusSummary,
    "",
    "| # | Status | YouTube title | Channel | Duration | Link | Notes |",
    "|---:|---|---|---|---:|---|---|",
    rows,
    "",
  ].join("\n");
}

function toCsv(items: NonAddedItem[]): string {
  const columns: Array<keyof NonAddedItem> = [
    "index",
    "status",
    "youtubeTitle",
    "youtubeChannel",
    "youtubeDurationSeconds",
    "youtubeUrl",
    "reviewerNotes",
  ];
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(","));

  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function formatDuration(seconds: number | null): string {
  return seconds === null ? "" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function markdownLink(label: string, url: string): string {
  return url === "" ? "" : `[${label}](${url})`;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}
