import { mkdirSync, writeFileSync } from "node:fs";
import { readManualProgress, readManualQueue, type ManualProgressItem, type ManualQueueItem, type ManualStatus } from "./lib/manual-review";
import { toCsv } from "./lib/csv";
import { formatDuration } from "./lib/util";

type NonAddedItem = {
  index: number;
  status: Exclude<ManualStatus, "added">;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDurationSeconds: number | null;
  youtubeUrl: string;
  reviewerNotes: string;
};

const csvColumns: Array<keyof NonAddedItem> = [
  "index",
  "status",
  "youtubeTitle",
  "youtubeChannel",
  "youtubeDurationSeconds",
  "youtubeUrl",
  "reviewerNotes",
];
const progress = readManualProgress();
const queue = readManualQueue();
const queueByIndex = new Map(queue.map((item) => [item.index, item]));
const nonAdded = progress
  .filter((item) => item.status !== "added")
  .map((item) => toNonAddedItem(item, queueByIndex.get(item.index)))
  .sort((left, right) => left.index - right.index);

mkdirSync("reports/manual-review", { recursive: true });
mkdirSync("docs", { recursive: true });
writeFileSync("reports/manual-review/non-added-simple.csv", toCsv(nonAdded, csvColumns));
writeFileSync("reports/manual-review/non-added-simple.md", toMarkdown(nonAdded));
writeFileSync("data/manual-review/non-added-simple.csv", toCsv(nonAdded, csvColumns));
writeFileSync("docs/non-added-youtube-items.md", toMarkdown(nonAdded));

console.log(`Exported non-added items: ${nonAdded.length}`);
console.log("Wrote reports/manual-review/non-added-simple.csv");
console.log("Wrote reports/manual-review/non-added-simple.md");
console.log("Wrote data/manual-review/non-added-simple.csv");
console.log("Wrote docs/non-added-youtube-items.md");

function toNonAddedItem(progressItem: ManualProgressItem, queueItem: ManualQueueItem | undefined): NonAddedItem {
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
  const rows = items.map((item) => toMarkdownListItem(item)).join("\n\n");

  return [
    "# Non-Added YouTube Items",
    "",
    `Total: ${items.length}`,
    "",
    statusSummary,
    "",
    rows,
    "",
  ].join("\n");
}

function toMarkdownListItem(item: NonAddedItem): string {
  return [
    `${item.index}. ${markdownCell(item.youtubeTitle)}`,
    `   - Status: ${item.status}`,
    `   - Channel: ${markdownCell(item.youtubeChannel)}`,
    `   - Duration: ${formatDuration(item.youtubeDurationSeconds)}`,
    `   - YouTube: ${item.youtubeUrl}`,
    `   - Notes: ${markdownCell(item.reviewerNotes)}`,
  ].join("\n");
}

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}
